package voice

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestHarnessTalkGreetingAndPresentationSupportStayContextual(t *testing.T) {
	for _, tc := range []struct{ locale, greeting, outline, hint, message, reason, example string }{
		{"id", "Halo, Morii.", "Tolong beri kerangka presentasi tata surya.", "Tolong beri satu petunjuk.", "Pesan utama", "Alasan", "Contoh"},
		{"en", "Hi, Morii.", "Please give me an outline for a solar system presentation.", "Please give me one hint.", "Main message", "Reason", "Example"},
	} {
		t.Run(tc.locale, func(t *testing.T) {
			_, server := testServer(t, Config{}, nil)
			client := connectHarnessClient(t, server, false, "talk", tc.locale)
			response := client.text(1, tc.greeting)
			if !bytes.Equal(response.Panel, []byte("null")) || response.Animation != "wave" {
				t.Fatal("a greeting started an unwanted topic or story wizard")
			}
			response = client.text(2, "I want to explain an idea.")
			if !bytes.Equal(response.Panel, []byte("null")) {
				t.Fatal("an ordinary talk turn forced a panel")
			}
			response = client.text(3, tc.outline)
			var panel harnessPanel
			if json.Unmarshal(response.Panel, &panel) != nil || panel.Type != "show_outline" || len(panel.Parts) != 3 {
				t.Fatal("a presentation outline request did not produce one bounded outline")
			}
			for index, label := range []string{tc.message, tc.reason, tc.example} {
				if !strings.HasPrefix(panel.Parts[index], label+":") {
					t.Fatal("a general presentation request was changed into a hobby practice")
				}
			}
			response = client.text(4, tc.hint)
			if json.Unmarshal(response.Panel, &panel) != nil || panel.Type != "show_hint" || !strings.Contains(strings.ToLower(panel.Text), strings.ToLower(tc.message)) {
				t.Fatal("a talk hint did not support the presentation's main message")
			}
		})
	}
}

func TestHarnessLiveTextUsesCoachAudioAndConfirmedPlaybackContext(t *testing.T) {
	providers := &fakeProviders{}
	coach := &fakeHarnessProvider{}
	lab, server := testServer(t, labConfig(), providers)
	lab.harnessCoach = coach
	client := connectHarnessClient(t, server, true, "talk", "en")
	client.send(`{"type":"turn.text","version":2,"turnId":1,"generation":1,"text":"Hi, Morii."}`)
	first := client.until("turn.response")
	metrics := client.until("turn.metrics")
	client.until("turn.state")
	if first.Source != "ai" || metrics.AudioSeconds == nil || *metrics.AudioSeconds != 0 || metrics.STTMs == nil || *metrics.STTMs != 0 {
		t.Fatal("typed fallback pretended to capture microphone audio")
	}
	client.send(fmt.Sprintf(`{"type":"response.played","version":2,"turnId":1,"generation":1,"responseId":%q}`, first.ResponseID))
	client.send(`{"type":"turn.text","version":2,"turnId":2,"generation":2,"text":"Help me practice a presentation."}`)
	client.until("turn.response")
	client.until("turn.metrics")
	client.until("turn.state")
	inputs := coach.snapshot()
	if len(inputs) != 2 || inputs[1].Action != "" || len(inputs[1].History) != 1 || inputs[1].History[0].HeardReply != first.Text {
		t.Fatal("typed fallback lost speech evidence or completed playback context")
	}
	if providers.listens.Load() != 0 || providers.responses.Load() != 0 || providers.speech.Load() != 2 {
		t.Fatal("typed fallback contacted STT, skipped harness coaching, or omitted TTS")
	}
}

func TestHarnessLiveTextSharesBudgetAndPreservesRejectedGeneration(t *testing.T) {
	config := labConfig()
	config.MaxLabUSD = turnReserveUSD
	providers := &fakeProviders{}
	coach := &fakeHarnessProvider{}
	lab, server := testServer(t, config, providers)
	lab.harnessCoach = coach
	client := connectHarnessClient(t, server, true, "talk", "en")
	client.send(`{"type":"turn.text","version":2,"turnId":1,"generation":1,"text":"Hi, Morii."}`)
	first := client.until("turn.response")
	client.until("turn.metrics")
	client.until("turn.state")
	client.send(`{"type":"turn.text","version":2,"turnId":2,"generation":2,"text":"Another idea."}`)
	if got := client.next(); got.Type != "error" || got.Code != "limit" || got.Generation == nil || *got.Generation != 2 {
		t.Fatalf("typed fallback escaped the live budget: %+v", got)
	}
	client.send(fmt.Sprintf(`{"type":"response.played","version":2,"turnId":1,"generation":1,"responseId":%q}`, first.ResponseID))
	client.send(`{"type":"session.close","version":2}`)
	if got := client.next(); got.Type != "session.closed" || got.Generation == nil || *got.Generation != 1 {
		t.Fatal("rejected typed fallback mutated accepted state")
	}
	if len(coach.snapshot()) != 1 || providers.speech.Load() != 1 || providers.listens.Load() != 0 {
		t.Fatal("budget rejection contacted a provider")
	}
}

func TestHarnessLiveTextCancellationDropsOutputAndTTS(t *testing.T) {
	providers := &fakeProviders{}
	coach := &fakeHarnessProvider{started: make(chan struct{}, 1), release: make(chan struct{})}
	lab, server := testServer(t, labConfig(), providers)
	lab.harnessCoach = coach
	client := connectHarnessClient(t, server, true, "talk", "en")
	client.send(`{"type":"turn.text","version":2,"turnId":1,"generation":1,"text":"An idea."}`)
	client.until("turn.state")
	select {
	case <-coach.started:
	case <-client.ctx.Done():
		t.Fatal("typed fallback did not start coaching")
	}
	client.send(`{"type":"turn.cancel","version":2,"turnId":1,"generation":1}`)
	client.until("turn.cancelled")
	close(coach.release)
	client.send(`{"type":"session.close","version":2}`)
	client.until("session.closed")
	if providers.speech.Load() != 0 || providers.listens.Load() != 0 {
		t.Fatal("cancelled typed fallback reached a speech provider")
	}
}

// A policy failure is enforced again at the session boundary before visible or audio output.
func TestHarnessLiveTextRejectsInventedAssessmentBeforeTTS(t *testing.T) {
	providers := &fakeProviders{}
	coach := &fakeHarnessProvider{result: &harnessReply{Text: "Add a reason.", Animation: "neutral", Panel: &harnessPanel{Type: "propose_feedback", Quote: "Invented evidence", Observation: "You gave an idea.", NextStep: "Add a reason.", RubricID: "idea-and-reason-v1", Status: "observed"}}}
	lab, server := testServer(t, labConfig(), providers)
	lab.harnessCoach = coach
	client := connectHarnessClient(t, server, true, "practice", "en")
	client.send(`{"type":"turn.text","version":2,"turnId":1,"generation":1,"text":"I like drawing."}`)
	client.until("turn.state")
	if got := client.next(); got.Type != "error" || got.Code != "unsafe" {
		t.Fatalf("invented assessment escaped: %+v", got)
	}
	if providers.speech.Load() != 0 {
		t.Fatal("unsafe typed feedback reached TTS")
	}
}
