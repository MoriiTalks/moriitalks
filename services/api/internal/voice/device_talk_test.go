package voice

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func deviceConfig(endpoint string) Config {
	return Config{DeviceTalkEnabled: true, CoachProvider: "hermes", HermesURL: endpoint + "/v1", HermesKey: "test", HermesNoToolsConfirmed: true, MaxSessionUSD: 0.10, MaxLabUSD: 0.10}
}

func connectDeviceClient(t *testing.T, server *httptest.Server, adult bool) *harnessClient {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	connection, _, err := websocket.Dial(ctx, server.URL+"/v2/device-talk", nil)
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	t.Cleanup(func() { connection.CloseNow(); cancel() })
	client := &harnessClient{testClient: &testClient{t: t, connection: connection, ctx: ctx}}
	client.send(fmt.Sprintf(`{"type":"session.start","version":2,"locale":"id","mode":"talk","topic":"ideas","adultConfirmed":%t}`, adult))
	return client
}

func TestDeviceTalkConfigurationRequiresIsolatedHermes(t *testing.T) {
	for _, test := range []struct {
		name    string
		config  Config
		enabled bool
	}{
		{"disabled", Config{}, false},
		{"hermes", deviceConfig("http://127.0.0.1:1234"), true},
		{"cloud_only", labConfig(), false},
		{"missing_key", Config{DeviceTalkEnabled: true, CoachProvider: "hermes", HermesURL: "http://127.0.0.1:1234/v1", HermesNoToolsConfirmed: true}, false},
		{"tools_unconfirmed", Config{DeviceTalkEnabled: true, CoachProvider: "hermes", HermesURL: "http://127.0.0.1:1234/v1", HermesKey: "test"}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, server := testServer(t, test.config, nil)
			response, err := http.Get(server.URL + "/v2/device-talk/config")
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			var config deviceTalkConfiguration
			decoder := json.NewDecoder(response.Body)
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&config); err != nil {
				t.Fatal(err)
			}
			if config.Version != 2 || config.Enabled != test.enabled || !config.AdultOnly || config.Input != "device" || config.Output != "device" || config.Limits != (Limits{300, 30, 8}) || response.Header.Get("Cache-Control") != "no-store" {
				t.Fatalf("unexpected device configuration: %+v", config)
			}
		})
	}
}

func TestDeviceTalkEnableFlagIsStrict(t *testing.T) {
	t.Setenv("DEVICE_TALK_ENABLED", "yes")
	if _, err := ConfigFromEnv(); err == nil {
		t.Fatal("invalid enable flag was accepted")
	}
	t.Setenv("DEVICE_TALK_ENABLED", "true")
	config, err := ConfigFromEnv()
	if err != nil || !config.DeviceTalkEnabled || config.deviceTalkEnabled() {
		t.Fatalf("enablement must still require configured Hermes: %+v, %v", config, err)
	}
}

func TestDeviceTalkRejectsUnconfirmedOrDisabledSession(t *testing.T) {
	for _, test := range []struct {
		name   string
		config Config
		adult  bool
	}{
		{"disabled", Config{}, true},
		{"adult_required", deviceConfig("http://127.0.0.1:1234"), false},
	} {
		t.Run(test.name, func(t *testing.T) {
			providers := &fakeProviders{}
			coach := &fakeHarnessProvider{}
			lab, server := testServer(t, test.config, providers)
			lab.deviceCoach = coach
			client := connectDeviceClient(t, server, test.adult)
			failure := client.next()
			if failure.Type != "error" || failure.Code != "unavailable" || failure.Recoverable == nil || *failure.Recoverable {
				t.Fatalf("adult device session was not rejected: %+v", failure)
			}
			client.send(`{"type":"turn.text","version":2,"turnId":1,"generation":1,"text":"Halo Morii."}`)
			failure = client.next()
			if failure.Type != "error" || failure.Code != "invalid_message" || len(coach.snapshot()) != 0 || providers.listens.Load()+providers.responses.Load()+providers.speech.Load() != 0 {
				t.Fatal("rejected session reached a provider or fell back to preview")
			}
		})
	}
}

func TestDeviceTalkUsesHermesPanelsAndConfirmedHistoryWithoutCloudSpeech(t *testing.T) {
	inputs := make(chan harnessInput, 3)
	hermes := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request hermesCoachRequest
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer test" || decoder.Decode(&request) != nil || !request.Stream || len(request.Messages) != 2 || !strings.Contains(request.Messages[0].Content, "Morii") {
			t.Error("invalid isolated Hermes request")
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		var input harnessInput
		if json.Unmarshal([]byte(request.Messages[1].Content), &input) != nil {
			t.Error("invalid Hermes input")
			return
		}
		inputs <- input
		text := `{"text":"Halo. Apa yang ingin kamu jelaskan?","animation":"wave","panel":null}`
		if input.Action == "outline" {
			text = `{"text":"Mulai dengan topik, lalu beri satu alasan.","animation":"encourage","panel":{"type":"show_outline","title":"Kerangka presentasi","parts":["Sebutkan topik.","Jelaskan satu alasan.","Berikan contoh."]}}`
		}
		writeDeviceHermesStreamReply(w, text)
	}))
	defer hermes.Close()
	providers := &fakeProviders{}
	lab, server := testServer(t, deviceConfig(hermes.URL), providers)
	cloudCoach := &fakeHarnessProvider{}
	lab.harnessCoach = cloudCoach
	client := connectDeviceClient(t, server, true)
	ready := client.until("session.ready")
	if ready.Kind != "live" || ready.Limits == nil || ready.Limits.MaxTurns != 8 || lab.config.liveEnabled() {
		t.Fatalf("device session changed cloud readiness: %+v", ready)
	}
	first := client.text(1, "Halo Morii.")
	if first.Source != "ai" || first.Animation != "wave" || string(first.Panel) != "null" {
		t.Fatalf("Hermes reply not delivered: %+v", first)
	}
	<-inputs
	second := client.text(2, "Saya ingin latihan presentasi.")
	input := <-inputs
	if len(input.History) != 1 || input.History[0].HeardReply != "" {
		t.Fatal("unplayed text was treated as heard")
	}
	client.send(fmt.Sprintf(`{"type":"response.played","version":2,"turnId":2,"generation":2,"responseId":%q}`, second.ResponseID))
	third := client.action(3, second.ResponseID, "outline")
	input = <-inputs
	if len(input.History) != 2 || input.History[1].HeardReply != second.Text || input.Action != "outline" || panelKind(t, third) != "show_outline" {
		t.Fatalf("history or panel action failed: %+v, %+v", input, third)
	}
	if providers.listens.Load()+providers.responses.Load()+providers.speech.Load() != 0 || len(cloudCoach.snapshot()) != 0 || lab.reservedUSD != 0 {
		t.Fatal("device session reached cloud speech or dollar accounting")
	}
}

func TestDeviceTalkRejectsAudioAndBoundsTurns(t *testing.T) {
	providers := &fakeProviders{}
	lab, server := testServer(t, deviceConfig("http://127.0.0.1:1234"), providers)
	coach := &fakeHarnessProvider{result: &harnessReply{Text: "Coba jelaskan satu ide.", Animation: "neutral"}}
	lab.deviceCoach = coach
	client := connectDeviceClient(t, server, true)
	client.until("session.ready")
	client.send(`{"type":"turn.start","version":2,"turnId":1,"generation":1,"sampleRate":16000,"channels":1,"encoding":"pcm_s16le"}`)
	if failure := client.next(); failure.Type != "error" || failure.Code != "invalid_message" {
		t.Fatalf("audio was accepted: %+v", failure)
	}
	client.audio(make([]byte, 3200))
	if failure := client.next(); failure.Type != "error" {
		t.Fatal("binary audio was accepted")
	}
	for turn := 1; turn <= maxTurns; turn++ {
		client.send(fmt.Sprintf(`{"type":"turn.text","version":2,"turnId":%d,"generation":%d,"text":"Saya ingin berlatih."}`, turn, turn))
		client.until("turn.response")
		metrics := client.until("turn.metrics")
		client.until("turn.state")
		if metrics.TTSCharacters == nil || *metrics.TTSCharacters != 0 || metrics.AudioSeconds == nil || *metrics.AudioSeconds != 0 || metrics.TTSMs == nil || *metrics.TTSMs != 0 {
			t.Fatalf("device speech was counted as cloud speech: %+v", metrics)
		}
	}
	client.send(`{"type":"turn.text","version":2,"turnId":9,"generation":9,"text":"Saya ingin lanjut."}`)
	if failure := client.next(); failure.Type != "error" || len(coach.snapshot()) != 8 || providers.listens.Load()+providers.speech.Load() != 0 {
		t.Fatal("device turn limit failed")
	}
}

func TestDeviceTalkCancellationDoesNotPresentStaleReply(t *testing.T) {
	coach := &fakeHarnessProvider{started: make(chan struct{}, 1), release: make(chan struct{})}
	lab, server := testServer(t, deviceConfig("http://127.0.0.1:1234"), &fakeProviders{})
	lab.deviceCoach = coach
	client := connectDeviceClient(t, server, true)
	client.until("session.ready")
	client.send(`{"type":"turn.text","version":2,"turnId":1,"generation":1,"text":"Halo Morii."}`)
	<-coach.started
	client.send(`{"type":"turn.cancel","version":2,"turnId":1,"generation":1}`)
	client.until("turn.cancelled")
	close(coach.release)
	client.send(`{"type":"turn.text","version":2,"turnId":2,"generation":2,"text":"Saya ingin menjelaskan tanaman."}`)
	response := client.until("turn.response")
	client.until("turn.metrics")
	client.until("turn.state")
	if response.TurnID != 2 || len(coach.snapshot()) != 2 || len(coach.snapshot()[1].History) != 0 {
		t.Fatal("cancelled reply or history survived")
	}
}

func TestDeviceCoachRejectsVisibleUnsafeTextAndUnapprovedEffects(t *testing.T) {
	for _, text := range []string{"Tanggal percobaan kami 12-10-2026.", "Saya membandingkan 2026 dan 2027.", "Pertumbuhan tahun 2026 2027.", "Jumlah penduduknya 1234567."} {
		if !safeDeviceTalkText(text, 1000) {
			t.Fatalf("ordinary presentation numbers were rejected: %q", text)
		}
	}
	for _, text := range []string{"https://example.com", "name@example.com", "+62 812 345 6789", "alamat rumah", "teks\u202e", "teks\x01", "<script>", string([]byte{0xff})} {
		if safeDeviceTalkText(text, 1000) {
			t.Fatalf("unsafe device text accepted: %q", text)
		}
	}
	var calls atomic.Int32
	hermes := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		writeDeviceHermesStreamReply(w, `{"text":"Buka halaman ini.","animation":"neutral","panel":{"type":"navigate","url":"https://example.com"}}`)
	}))
	defer hermes.Close()
	coach := newDeviceHarnessCoach(deviceConfig(hermes.URL))
	input := harnessInput{Language: "id", Mode: "talk", Topic: "ideas", Speech: "Halo Morii."}
	if _, err := coach.RespondHarness(context.Background(), input); err == nil {
		t.Fatal("arbitrary model effect was accepted")
	}
	input.Speech = "name@example.com"
	if _, err := coach.RespondHarness(context.Background(), input); !errors.Is(err, errUnsafe) || calls.Load() != 1 {
		t.Fatal("private input reached Hermes")
	}
}

func TestDeviceCoachRejectsPrivateHistoryPanelBeforeHermes(t *testing.T) {
	var calls atomic.Int32
	hermes := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		writeDeviceHermesStreamReply(w, `{"text":"Halo.","animation":"wave","panel":null}`)
	}))
	defer hermes.Close()
	coach := newDeviceHarnessCoach(deviceConfig(hermes.URL))
	for _, text := range []string{"name@example.com", "+62 812 345 6789", "https://example.com", "teks\u202e"} {
		input := harnessInput{Language: "id", Mode: "talk", Topic: "ideas", Speech: "Jelaskan bagian kedua.", History: []harnessHistory{{Speech: "Beri satu petunjuk.", HeardReply: "Ini petunjuknya.", Panel: &harnessPanel{Type: "show_hint", Title: "Petunjuk", Text: text}}}}
		if _, err := coach.RespondHarness(context.Background(), input); !errors.Is(err, errUnsafe) {
			t.Fatalf("unsafe panel context reached Hermes: %q, %v", text, err)
		}
	}
	if calls.Load() != 0 {
		t.Fatal("private panel context made an extra model call")
	}
}

func TestDeviceCoachPreservesRequestCancellation(t *testing.T) {
	started := make(chan struct{})
	cancelled := make(chan struct{})
	hermes := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		close(started)
		<-r.Context().Done()
		close(cancelled)
	}))
	defer hermes.Close()
	coach := newDeviceHarnessCoach(deviceConfig(hermes.URL))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan error, 1)
	go func() {
		_, err := coach.RespondHarness(ctx, harnessInput{Language: "id", Mode: "talk", Topic: "ideas", Speech: "Halo Morii."})
		result <- err
	}()
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("request did not reach Hermes")
	}
	cancel()
	select {
	case err := <-result:
		if err == nil {
			t.Fatal("cancelled request succeeded")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Hermes cancellation did not complete")
	}
	select {
	case <-cancelled:
	case <-time.After(2 * time.Second):
		t.Fatal("HTTP request context was not cancelled")
	}
}

func TestDeviceCoachKeepsConfiguredModeration(t *testing.T) {
	for _, flagAt := range []int32{0, 1, 2} {
		t.Run(fmt.Sprint(flagAt), func(t *testing.T) {
			var screens, calls atomic.Int32
			moderation := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/moderations" || r.Header.Get("Authorization") != "Bearer moderation-test" {
					t.Error("device coach changed moderation credentials")
				}
				_, _ = fmt.Fprintf(w, `{"results":[{"flagged":%t}]}`, screens.Add(1) == flagAt)
			}))
			defer moderation.Close()
			hermes := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var request hermesCoachRequest
				if json.NewDecoder(r.Body).Decode(&request) != nil || !request.Stream {
					t.Error("moderation changed device streaming")
				}
				calls.Add(1)
				writeDeviceHermesStreamReply(w, `{"text":"Halo. Apa yang ingin kamu jelaskan?","animation":"wave","panel":null}`)
			}))
			defer hermes.Close()
			config := deviceConfig(hermes.URL)
			config.OpenAIKey = "moderation-test"
			coach := newDeviceHarnessCoach(config)
			coach.cloud.openAIURL = moderation.URL
			_, err := coach.RespondHarness(context.Background(), harnessInput{Language: "id", Mode: "talk", Topic: "ideas", Speech: "Halo Morii."})
			if flagAt == 0 {
				if err != nil || screens.Load() != 2 || calls.Load() != 1 {
					t.Fatalf("configured moderation was bypassed: %v", err)
				}
			} else if !errors.Is(err, errUnsafe) || (flagAt == 1 && calls.Load() != 0) || (flagAt == 2 && calls.Load() != 1) {
				t.Fatalf("flagged device content escaped: %v", err)
			}
		})
	}
}

type failingDeviceCoach struct{ calls atomic.Int32 }

func (p *failingDeviceCoach) RespondHarness(_ context.Context, input harnessInput) (harnessReply, error) {
	if p.calls.Add(1) == 1 {
		return harnessReply{}, errProvider
	}
	if len(input.History) != 0 {
		return harnessReply{}, errUnsafe
	}
	return harnessReply{Text: "Coba jelaskan satu ide.", Animation: "neutral"}, nil
}

func TestDeviceTalkRecoversAfterProviderFailureAndCancellation(t *testing.T) {
	lab, server := testServer(t, deviceConfig("http://127.0.0.1:1234"), &fakeProviders{})
	coach := &failingDeviceCoach{}
	lab.deviceCoach = coach
	client := connectDeviceClient(t, server, true)
	client.until("session.ready")
	client.send(`{"type":"turn.text","version":2,"turnId":1,"generation":1,"text":"Halo Morii."}`)
	client.until("turn.state")
	failure := client.next()
	if failure.Type != "error" || failure.Code != "provider" || failure.TurnID != 1 || failure.Generation == nil || *failure.Generation != 1 || failure.Recoverable == nil || !*failure.Recoverable {
		t.Fatalf("provider failure lost the accepted generation: %+v", failure)
	}
	client.send(`{"type":"turn.cancel","version":2,"turnId":1,"generation":1}`)
	client.until("turn.cancelled")
	response := client.text(2, "Saya ingin menjelaskan tanaman.")
	if response.TurnID != 2 || coach.calls.Load() != 2 {
		t.Fatal("provider failure prevented the next accepted turn")
	}
}

func TestDeviceTalkIgnoresStalePresentationAckWithoutChangingCurrentTurn(t *testing.T) {
	coach := &fakeHarnessProvider{result: &harnessReply{Text: "Coba jelaskan satu ide.", Animation: "neutral"}}
	lab, server := testServer(t, deviceConfig("http://127.0.0.1:1234"), &fakeProviders{})
	lab.deviceCoach = coach
	client := connectDeviceClient(t, server, true)
	client.until("session.ready")
	first := client.text(1, "Halo Morii.")
	second := client.text(2, "Saya ingin menjelaskan tanaman.")
	client.send(fmt.Sprintf(`{"type":"response.played","version":2,"turnId":1,"generation":1,"responseId":%q}`, first.ResponseID))
	if failure := client.next(); failure.Type != "error" || failure.Generation == nil || *failure.Generation != 1 {
		t.Fatalf("stale acknowledgement was not rejected: %+v", failure)
	}
	client.send(fmt.Sprintf(`{"type":"response.played","version":2,"turnId":2,"generation":2,"responseId":%q}`, second.ResponseID))
	client.text(3, "Tolong beri satu contoh.")
	input := coach.snapshot()[2]
	if len(input.History) != 2 || input.History[0].HeardReply != "" || input.History[1].HeardReply != second.Text {
		t.Fatal("stale acknowledgement changed history or prevented the current acknowledgement")
	}
}
