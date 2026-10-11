package voice

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

type fakeHarnessProvider struct {
	mu      sync.Mutex
	inputs  []harnessInput
	started chan struct{}
	release chan struct{}
	result  *harnessReply
}

type actionFeedbackProvider struct{}

func (actionFeedbackProvider) RespondHarness(_ context.Context, input harnessInput) (harnessReply, error) {
	if input.Action == "" {
		return scriptedHarnessReply(input), nil
	}
	return harnessReply{
		Text: "You shared an idea. Add one reason.", Animation: "neutral",
		Panel: &harnessPanel{Type: "propose_feedback", Quote: input.Speech, Observation: "You shared an idea.", NextStep: "Add one reason.", RubricID: "idea-and-reason-v1", Status: "observed"},
	}, nil
}

type delayedHarnessSpeech struct {
	*fakeProviders
	started chan struct{}
	release chan struct{}
}

// A gated connection makes slow error delivery deterministic without sleeping.
type harnessWriteGate struct {
	enabled atomic.Bool
	started chan struct{}
	release chan struct{}
	once    sync.Once
}

func (g *harnessWriteGate) unblock() { g.once.Do(func() { close(g.release) }) }

type harnessGatedListener struct {
	net.Listener
	gate *harnessWriteGate
}

func (l harnessGatedListener) Accept() (net.Conn, error) {
	connection, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	return harnessGatedConnection{Conn: connection, gate: l.gate}, nil
}

type harnessGatedConnection struct {
	net.Conn
	gate *harnessWriteGate
}

func (c harnessGatedConnection) Write(data []byte) (int, error) {
	if c.gate.enabled.Load() {
		select {
		case c.gate.started <- struct{}{}:
		default:
		}
		<-c.gate.release
	}
	return c.Conn.Write(data)
}

func (p *delayedHarnessSpeech) Speak(ctx context.Context, options sessionOptions, text string) ([]byte, error) {
	p.started <- struct{}{}
	select {
	case <-p.release:
		return p.fakeProviders.Speak(ctx, options, text)
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (p *fakeHarnessProvider) RespondHarness(ctx context.Context, input harnessInput) (harnessReply, error) {
	p.mu.Lock()
	p.inputs = append(p.inputs, input)
	p.mu.Unlock()
	if p.started != nil {
		p.started <- struct{}{}
		select {
		case <-p.release:
		case <-ctx.Done():
			return harnessReply{}, ctx.Err()
		}
	}
	if p.result != nil {
		return *p.result, nil
	}
	reply := scriptedHarnessReply(input)
	reply.InputTokens, reply.OutputTokens = 20, 15
	return reply, nil
}

func (p *fakeHarnessProvider) snapshot() []harnessInput {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]harnessInput{}, p.inputs...)
}

type harnessClient struct {
	*testClient
	sessionID string
}

func connectHarnessClient(t *testing.T, server *httptest.Server, adult bool, mode, locale string) *harnessClient {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	connection, _, err := websocket.Dial(ctx, server.URL+"/v2/voice", nil)
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	t.Cleanup(func() { connection.CloseNow(); cancel() })
	client := &harnessClient{testClient: &testClient{t: t, connection: connection, ctx: ctx}}
	client.send(fmt.Sprintf(`{"type":"session.start","version":2,"locale":%q,"mode":%q,"topic":"hobby","adultConfirmed":%t}`, locale, mode, adult))
	ready := client.until("session.ready")
	if ready.Generation == nil || *ready.Generation != 0 {
		t.Fatalf("invalid initial generation: %+v", ready)
	}
	return client
}

func (c *harnessClient) next() event {
	c.t.Helper()
	for {
		kind, data, err := c.connection.Read(c.ctx)
		if err != nil {
			c.t.Fatal(err)
		}
		if kind == websocket.MessageBinary {
			if string(data) != "ID3fake-audio" {
				c.t.Fatal("unexpected harness audio")
			}
			continue
		}
		var value event
		if json.Unmarshal(data, &value) != nil {
			c.t.Fatal("invalid harness event")
		}
		c.sequence++
		if value.Version != 2 || value.Sequence != c.sequence || value.Generation == nil || value.SessionID == "" {
			c.t.Fatalf("invalid harness envelope: %+v", value)
		}
		if c.sessionID == "" {
			c.sessionID = value.SessionID
		} else if c.sessionID != value.SessionID {
			c.t.Fatal("session identity changed")
		}
		return value
	}
}

func (c *harnessClient) until(kind string) event {
	c.t.Helper()
	for range 16 {
		value := c.next()
		if value.Type == kind {
			return value
		}
		if value.Type == "error" {
			c.t.Fatalf("unexpected harness failure: %+v", value)
		}
	}
	c.t.Fatalf("harness event %s did not arrive", kind)
	return event{}
}

func (c *harnessClient) text(turn int, speech string) event {
	c.t.Helper()
	c.send(fmt.Sprintf(`{"type":"turn.text","version":2,"turnId":%d,"generation":%d,"text":%q}`, turn, turn, speech))
	response := c.until("turn.response")
	c.until("turn.state")
	return response
}

func (c *harnessClient) action(turn int, id, action string) event {
	c.t.Helper()
	c.send(fmt.Sprintf(`{"type":"turn.action","version":2,"turnId":%d,"generation":%d,"responseId":%q,"actionId":%q}`, turn, turn, id, action))
	response := c.until("turn.response")
	c.until("turn.state")
	return response
}

func (c *harnessClient) record(turn int) event {
	c.t.Helper()
	c.send(fmt.Sprintf(`{"type":"turn.start","version":2,"turnId":%d,"generation":%d,"sampleRate":16000,"channels":1,"encoding":"pcm_s16le"}`, turn, turn))
	c.until("turn.state")
	c.audio(make([]byte, 3200))
	c.send(fmt.Sprintf(`{"type":"turn.commit","version":2,"turnId":%d,"generation":%d}`, turn, turn))
	response := c.until("turn.response")
	c.until("turn.metrics")
	c.until("turn.state")
	return response
}

func panelKind(t *testing.T, value event) string {
	t.Helper()
	if value.ResponseID == "" || value.Animation == "" || value.Panel == nil {
		t.Fatalf("incomplete reply: %+v", value)
	}
	var panel harnessPanel
	if json.Unmarshal(value.Panel, &panel) != nil {
		t.Fatalf("invalid panel: %s", value.Panel)
	}
	return panel.Type
}

func TestHarnessPreviewRunsGuidedMissionWithoutProviders(t *testing.T) {
	for _, locale := range []string{"id", "en"} {
		t.Run(locale, func(t *testing.T) {
			providers := &fakeProviders{}
			coach := &fakeHarnessProvider{}
			lab, server := testServer(t, Config{}, providers)
			lab.harnessCoach = coach
			client := connectHarnessClient(t, server, false, "practice", locale)
			bootstrap, brief, reason := "Help me start a practice.", "I enjoy drawing.", "I enjoy drawing because I can make stories."
			if locale == "id" {
				bootstrap, brief, reason = "Bantu aku memulai latihan.", "Aku suka menggambar.", "Aku suka menggambar karena bisa membuat cerita."
			}
			response := client.text(1, bootstrap)
			if got := panelKind(t, response); got != "show_outline" {
				t.Fatalf("bootstrap panel %s", got)
			}
			response = client.text(2, brief)
			if got := panelKind(t, response); got != "propose_feedback" {
				t.Fatalf("feedback panel %s", got)
			}
			response = client.action(3, response.ResponseID, "hint")
			if got := panelKind(t, response); got != "show_hint" {
				t.Fatalf("hint panel %s", got)
			}
			response = client.action(4, response.ResponseID, "outline")
			if got := panelKind(t, response); got != "show_outline" {
				t.Fatalf("outline panel %s", got)
			}
			response = client.text(5, reason)
			var feedback harnessPanel
			if json.Unmarshal(response.Panel, &feedback) != nil || feedback.Status != "observed" || !strings.Contains(reason, feedback.Quote) {
				t.Fatalf("feedback evidence invalid: %s", response.Panel)
			}
			response = client.action(6, response.ResponseID, "finish")
			if got := panelKind(t, response); got != "propose_next_mission" {
				t.Fatalf("mission panel %s", got)
			}
			response = client.action(7, response.ResponseID, "start_mission")
			if got := panelKind(t, response); got != "show_outline" {
				t.Fatalf("retry mission panel %s", got)
			}
			response = client.text(8, "stop")
			if got := panelKind(t, response); got != "request_end_session" {
				t.Fatalf("end panel %s", got)
			}
			if response.Source != "script" || providers.listens.Load() != 0 || providers.speech.Load() != 0 || len(coach.snapshot()) != 0 {
				t.Fatal("preview contacted a provider")
			}
		})
	}
}

func TestHarnessChoicesAreAllowlistedAndStaleActionsRejected(t *testing.T) {
	_, server := testServer(t, Config{}, nil)
	client := connectHarnessClient(t, server, false, "talk", "en")
	first := client.text(1, "Help me choose a topic.")
	if got := panelKind(t, first); got != "show_choices" {
		t.Fatalf("choice panel %s", got)
	}
	second := client.action(2, first.ResponseID, "hobby")
	client.send(fmt.Sprintf(`{"type":"turn.action","version":2,"turnId":3,"generation":3,"responseId":%q,"actionId":"day"}`, first.ResponseID))
	if got := client.next(); got.Type != "error" || got.Code != "invalid_message" {
		t.Fatal("stale action was accepted")
	}
	client.send(fmt.Sprintf(`{"type":"response.played","version":2,"turnId":1,"generation":1,"responseId":%q}`, first.ResponseID))
	if got := client.next(); got.Type != "error" {
		t.Fatal("stale playback acknowledgement was accepted")
	}
	client.send(fmt.Sprintf(`{"type":"panel.dismiss","version":2,"generation":2,"responseId":%q}`, second.ResponseID))
	client.send(`{"type":"session.close","version":2}`)
	client.until("session.closed")
}

func TestHarnessDismissedPanelCannotExecuteAChoice(t *testing.T) {
	_, server := testServer(t, Config{}, nil)
	client := connectHarnessClient(t, server, false, "talk", "en")
	response := client.text(1, "Help me choose a topic.")
	client.send(fmt.Sprintf(`{"type":"panel.dismiss","version":2,"generation":1,"responseId":%q}`, response.ResponseID))
	client.send(fmt.Sprintf(`{"type":"turn.action","version":2,"turnId":2,"generation":2,"responseId":%q,"actionId":"hobby"}`, response.ResponseID))
	if got := client.next(); got.Type != "error" || got.Code != "invalid_message" {
		t.Fatal("dismissed panel executed a choice")
	}
	client.send(`{"type":"turn.text","version":2,"turnId":2,"generation":4,"text":"Hello"}`)
	if got := client.next(); got.Type != "error" || got.Code != "invalid_message" {
		t.Fatal("nonmonotonic generation was accepted")
	}
}

func TestHarnessLiveContextRequiresCompletedPlaybackAndIsSessionLocal(t *testing.T) {
	providers := &fakeProviders{}
	coach := &fakeHarnessProvider{}
	lab, server := testServer(t, labConfig(), providers)
	lab.harnessCoach = coach
	client := connectHarnessClient(t, server, true, "practice", "en")
	first := client.record(1)
	second := client.record(2)
	inputs := coach.snapshot()
	if len(inputs) != 2 || len(inputs[1].History) != 1 || inputs[1].History[0].HeardReply != "" {
		t.Fatal("unplayed reply was treated as heard")
	}
	client.send(fmt.Sprintf(`{"type":"response.played","version":2,"turnId":2,"generation":2,"responseId":%q}`, second.ResponseID))
	client.record(3)
	inputs = coach.snapshot()
	if inputs[2].History[1].HeardReply != second.Text {
		t.Fatal("completed playback did not commit context")
	}
	if inputs[2].History[0].HeardReply != "" || first.Source != "ai" {
		t.Fatal("context or source changed unexpectedly")
	}
	other := connectHarnessClient(t, server, true, "practice", "en")
	other.record(1)
	inputs = coach.snapshot()
	if len(inputs[3].History) != 0 {
		t.Fatal("conversation leaked into another session")
	}
	if providers.responses.Load() != 0 || providers.speech.Load() != 4 {
		t.Fatal("v2 used the text-only coach or skipped speech")
	}
}

func TestHarnessBudgetErrorsIdentifyAttemptedGenerationWithoutAcceptingIt(t *testing.T) {
	providers := &fakeProviders{}
	coach := &fakeHarnessProvider{}
	config := labConfig()
	config.MaxLabUSD = turnReserveUSD
	lab, server := testServer(t, config, providers)
	lab.harnessCoach = coach
	client := connectHarnessClient(t, server, true, "practice", "en")
	first := client.record(1)
	client.send(fmt.Sprintf(`{"type":"turn.action","version":2,"turnId":2,"generation":2,"responseId":%q,"actionId":"finish"}`, first.ResponseID))
	if got := client.next(); got.Type != "error" || got.Code != "limit" || got.Generation == nil || *got.Generation != 2 || got.TurnID != 2 {
		t.Fatalf("action budget error did not identify attempted turn: %+v", got)
	}
	client.send(`{"type":"turn.start","version":2,"turnId":2,"generation":2,"sampleRate":16000,"channels":1,"encoding":"pcm_s16le"}`)
	if got := client.next(); got.Type != "error" || got.Code != "limit" || got.Generation == nil || *got.Generation != 2 {
		t.Fatalf("recording budget error did not identify attempted turn: %+v", got)
	}
	client.send(fmt.Sprintf(`{"type":"response.played","version":2,"turnId":1,"generation":1,"responseId":%q}`, first.ResponseID))
	client.send(`{"type":"session.close","version":2}`)
	if got := client.next(); got.Type != "session.closed" || got.Generation == nil || *got.Generation != 1 {
		t.Fatalf("a rejected command mutated accepted generation or pending response: %+v", got)
	}
	if providers.listens.Load() != 1 || providers.speech.Load() != 1 || len(coach.snapshot()) != 1 {
		t.Fatal("budget rejection contacted a provider")
	}
}

func TestHarnessBudgetRejectionReleasesGlobalLockBeforeSlowDelivery(t *testing.T) {
	config := labConfig()
	config.MaxLabUSD = turnReserveUSD
	lab := NewServer(config)
	lab.providers, lab.harnessCoach = &fakeProviders{}, &fakeHarnessProvider{}
	mux := http.NewServeMux()
	lab.Register(mux)
	server := httptest.NewUnstartedServer(mux)
	gate := &harnessWriteGate{started: make(chan struct{}, 1), release: make(chan struct{})}
	defer gate.unblock()
	server.Listener = harnessGatedListener{Listener: server.Listener, gate: gate}
	server.Start()
	t.Cleanup(func() { lab.Close(); server.Close() })
	client := connectHarnessClient(t, server, true, "practice", "en")
	response := client.record(1)
	gate.enabled.Store(true)
	client.send(fmt.Sprintf(`{"type":"turn.action","version":2,"turnId":2,"generation":2,"responseId":%q,"actionId":"hint"}`, response.ResponseID))
	select {
	case <-gate.started:
	case <-client.ctx.Done():
		t.Fatal("error delivery did not reach the gated connection")
	}
	if lab.mu.TryLock() {
		lab.mu.Unlock()
	} else {
		t.Error("slow budget error delivery held the global admission and shutdown lock")
	}
	gate.unblock()
	if got := client.next(); got.Type != "error" || got.Code != "limit" {
		t.Fatalf("budget semantics changed: %+v", got)
	}
}

func TestHarnessPreviewDoesNotEndAStopMotionStory(t *testing.T) {
	_, server := testServer(t, Config{}, nil)
	client := connectHarnessClient(t, server, false, "practice", "en")
	response := client.text(1, "I enjoy stop motion animation because I can tell stories.")
	if got := panelKind(t, response); got != "propose_feedback" {
		t.Fatalf("a hobby story was mistaken for an end request: %s", got)
	}
	response = client.text(2, "I want to stop now.")
	if got := panelKind(t, response); got != "request_end_session" {
		t.Fatalf("explicit end request was ignored: %s", got)
	}
	for _, speech := range []string{"Stop!", "Berhenti.", "Aku ingin berhenti sekarang."} {
		if !previewEndRequest(strings.ToLower(speech)) {
			t.Fatalf("explicit end request was ignored: %s", speech)
		}
	}
}

func TestHarnessCancellationDropsPendingOutputAndContext(t *testing.T) {
	providers := &fakeProviders{}
	coach := &fakeHarnessProvider{started: make(chan struct{}, 1), release: make(chan struct{})}
	lab, server := testServer(t, labConfig(), providers)
	lab.harnessCoach = coach
	client := connectHarnessClient(t, server, true, "practice", "en")
	client.send(`{"type":"turn.start","version":2,"turnId":1,"generation":1,"sampleRate":16000,"channels":1,"encoding":"pcm_s16le"}`)
	client.until("turn.state")
	client.audio(make([]byte, 3200))
	client.send(`{"type":"turn.commit","version":2,"turnId":1,"generation":1}`)
	select {
	case <-coach.started:
	case <-client.ctx.Done():
		t.Fatal("harness coach did not start")
	}
	client.send(`{"type":"turn.cancel","version":2,"turnId":1,"generation":1}`)
	client.until("turn.cancelled")
	close(coach.release)
	client.send(`{"type":"session.close","version":2}`)
	if got := client.next(); got.Type != "session.closed" {
		t.Fatalf("cancelled output escaped: %+v", got)
	}
	if providers.speech.Load() != 0 {
		t.Fatal("cancelled reply reached TTS")
	}
}

func TestHarnessPlaybackAcknowledgementWaitsForAudioDelivery(t *testing.T) {
	providers := &delayedHarnessSpeech{fakeProviders: &fakeProviders{}, started: make(chan struct{}, 1), release: make(chan struct{})}
	coach := &fakeHarnessProvider{}
	lab, server := testServer(t, labConfig(), providers)
	lab.harnessCoach = coach
	client := connectHarnessClient(t, server, true, "practice", "en")
	client.send(`{"type":"turn.start","version":2,"turnId":1,"generation":1,"sampleRate":16000,"channels":1,"encoding":"pcm_s16le"}`)
	client.until("turn.state")
	client.audio(make([]byte, 3200))
	client.send(`{"type":"turn.commit","version":2,"turnId":1,"generation":1}`)
	response := client.until("turn.response")
	select {
	case <-providers.started:
	case <-client.ctx.Done():
		t.Fatal("TTS did not start")
	}
	ack := fmt.Sprintf(`{"type":"response.played","version":2,"turnId":1,"generation":1,"responseId":%q}`, response.ResponseID)
	client.send(ack)
	if got := client.next(); got.Type != "error" || got.Code != "invalid_message" {
		t.Fatal("an early acknowledgement treated generated text as heard")
	}
	close(providers.release)
	client.until("turn.metrics")
	client.until("turn.state")
	client.send(ack)
	client.record(2)
	inputs := coach.snapshot()
	if inputs[1].History[0].HeardReply != response.Text {
		t.Fatal("completed audio was not acknowledged")
	}
}

func TestHarnessRejectsUntrustedEffectsAndUnsupportedEvidence(t *testing.T) {
	input := harnessInput{Language: "en", Mode: "practice", Speech: "I enjoy drawing.", Mission: harnessMission{ID: "first-explanation"}}
	for _, panel := range []*harnessPanel{
		{Type: "open_url", Text: "Hello"},
		{Type: "show_hint", Title: "Hint", Text: "https://example.com"},
		{Type: "show_choices", Title: "Topics", Choices: []harnessChoice{{"hobby", "Hobbies"}, {"hobby", "Hobbies"}}},
		{Type: "propose_feedback", Quote: "invented evidence", Observation: "You gave a reason.", NextStep: "Try an example.", RubricID: "idea-and-reason-v1", Status: "observed"},
		{Type: "propose_feedback", Quote: "I enjoy drawing.", Observation: "You gave an idea.", NextStep: "Add a reason.", RubricID: "other", Status: "observed"},
		{Type: "propose_next_mission", MissionID: "first-explanation", Title: "Next", Text: "Try again."},
	} {
		if err := validateHarnessReply(harnessReply{Text: "Try one reason.", Animation: "neutral", Panel: panel}, input); !errors.Is(err, errUnsafe) {
			t.Fatalf("unsafe panel accepted: %+v", panel)
		}
	}
	valid := scriptedHarnessReply(input)
	input.Mode = "talk"
	if validateHarnessReply(valid, input) == nil {
		t.Fatal("assessment panel accepted in talk mode")
	}
	for _, raw := range []string{
		`{"text":"Hello.","animation":"neutral","panel":null,"code":"run"}`,
		`{"text":"Hello.","text":"Goodbye.","animation":"neutral","panel":null}`,
		`{"text":"Hello.","animation":"neutral","panel":{"type":"show_hint","title":"Hint","text":"Try a reason.","quote":""}}`,
		`{"text":"Hello.","animation":"neutral","panel":{"type":"show_choices","title":"Topic","choices":[{"id":"hobby","label":"Hobbies","url":"no"}]}}`,
	} {
		if _, err := decodeHarnessReply([]byte(raw)); err == nil {
			t.Fatalf("invalid provider output accepted: %s", raw)
		}
	}
}

func TestHarnessFeedbackRequiresSpeechInsteadOfAButtonAction(t *testing.T) {
	input := harnessInput{Mode: "practice", Language: "en", Speech: "I enjoy drawing."}
	reply := scriptedHarnessReply(input)
	if err := validateHarnessReply(reply, input); err != nil {
		t.Fatalf("actual speech feedback was rejected: %v", err)
	}
	for _, action := range []string{"hint", "outline", "retry", "finish", "start_mission", "hobby"} {
		input.Action = action
		if !errors.Is(validateHarnessReply(reply, input), errUnsafe) {
			t.Fatalf("button action became speaking evidence: %s", action)
		}
	}
	input.Action = ""
	reply.Panel.Quote, reply.Panel.Status = "", "unassessable"
	if err := validateHarnessReply(reply, input); err != nil {
		t.Fatalf("unassessable speech feedback was rejected: %v", err)
	}
}

func TestHarnessActionFeedbackNeverReachesPanelOrSpeech(t *testing.T) {
	providers := &fakeProviders{}
	lab, server := testServer(t, labConfig(), providers)
	lab.harnessCoach = actionFeedbackProvider{}
	client := connectHarnessClient(t, server, true, "practice", "en")
	response := client.record(1)
	client.send(fmt.Sprintf(`{"type":"turn.action","version":2,"turnId":2,"generation":2,"responseId":%q,"actionId":"hint"}`, response.ResponseID))
	client.until("turn.state")
	if got := client.next(); got.Type != "error" || got.Code != "unsafe" {
		t.Fatalf("action-derived feedback escaped the provider boundary: %+v", got)
	}
	if providers.speech.Load() != 1 {
		t.Fatal("button feedback reached TTS")
	}
}

func TestHarnessContextHasCountAndTextBudgets(t *testing.T) {
	var history []harnessHistory
	for range 8 {
		history = append(history, harnessHistory{Speech: strings.Repeat("x", 1000), HeardReply: strings.Repeat("y", 400)})
	}
	bounded := boundedHarnessHistory(history)
	units := 0
	for _, turn := range bounded {
		units += textUnits(turn.Speech) + textUnits(turn.HeardReply)
	}
	if len(bounded) != 2 || units > 3000 {
		t.Fatalf("history not bounded: turns=%d units=%d", len(bounded), units)
	}
	for index := range history {
		history[index].Speech, history[index].HeardReply = "idea", "reply"
	}
	if len(boundedHarnessHistory(history)) != 6 {
		t.Fatal("history exceeded six turns")
	}
}

func TestHarnessProviderUsesStrictSchemaAndModeratesEveryVisibleString(t *testing.T) {
	var moderated []string
	var request harnessCoachRequest
	input := harnessInput{Language: "en", Mode: "practice", Topic: "hobby", Speech: "I enjoy drawing.", History: []harnessHistory{{Speech: "Earlier idea.", HeardReply: "Earlier heard reply."}}, Mission: harnessMission{ID: "first-explanation"}}
	result := scriptedHarnessReply(input)
	vendor := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/moderations":
			var body moderationRequest
			if json.NewDecoder(r.Body).Decode(&body) != nil {
				t.Error("invalid moderation request")
			}
			moderated = append(moderated, body.Input)
			_, _ = w.Write([]byte(`{"results":[{"flagged":false}]}`))
		case "/responses":
			if json.NewDecoder(r.Body).Decode(&request) != nil {
				t.Error("invalid harness coach request")
			}
			encoded, _ := json.Marshal(result)
			_, _ = fmt.Fprintf(w, `{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":%q}]}],"usage":{"input_tokens":100,"output_tokens":60}}`, encoded)
		default:
			t.Errorf("unexpected vendor route %s", r.URL.Path)
		}
	}))
	defer vendor.Close()
	provider := newCloudProviders(Config{})
	provider.client, provider.openAIURL = vendor.Client(), vendor.URL
	reply, err := provider.RespondHarness(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	if reply.Panel == nil || len(moderated) != 2 || !strings.Contains(moderated[1], reply.Panel.Quote) || !strings.Contains(moderated[1], reply.Panel.NextStep) {
		t.Fatal("a visible panel string bypassed moderation")
	}
	var compactSchema bytes.Buffer
	if json.Compact(&compactSchema, harnessReplySchema) != nil {
		t.Fatal("invalid embedded schema")
	}
	if request.Store || request.Text.Format.Type != "json_schema" || !request.Text.Format.Strict || request.MaxOutputTokens != 600 || !bytes.Equal(bytes.TrimSpace(request.Text.Format.Schema), compactSchema.Bytes()) {
		t.Fatal("strict generated provider schema was not used")
	}
	var decoded harnessInput
	if json.Unmarshal([]byte(request.Input), &decoded) != nil || decoded.History[0].HeardReply != input.History[0].HeardReply {
		t.Fatal("heard context was not sent to coach")
	}
}

func TestHarnessProviderBlocksFlaggedPanelAndInput(t *testing.T) {
	for _, flagAt := range []int{1, 2} {
		t.Run(fmt.Sprint(flagAt), func(t *testing.T) {
			moderations, responses := 0, 0
			vendor := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if r.URL.Path == "/moderations" {
					moderations++
					_, _ = fmt.Fprintf(w, `{"results":[{"flagged":%t}]}`, moderations == flagAt)
					return
				}
				responses++
				result, _ := json.Marshal(harnessReply{Text: "Try an idea.", Animation: "neutral", Panel: &harnessPanel{Type: "show_hint", Title: "Hint", Text: "A visible panel is screened too."}})
				_, _ = fmt.Fprintf(w, `{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":%q}]}],"usage":{"input_tokens":100,"output_tokens":60}}`, result)
			}))
			defer vendor.Close()
			provider := newCloudProviders(Config{})
			provider.client, provider.openAIURL = vendor.Client(), vendor.URL
			_, err := provider.RespondHarness(context.Background(), harnessInput{Mode: "practice", Speech: "I enjoy drawing."})
			if !errors.Is(err, errUnsafe) || (flagAt == 1 && responses != 0) || (flagAt == 2 && responses != 1) {
				t.Fatalf("flagged content escaped: err=%v responses=%d", err, responses)
			}
		})
	}
}

func TestHarnessProtocolRejectsMissingExtraAndOutOfRangeFields(t *testing.T) {
	for _, message := range []string{
		`{"type":"session.start","version":1,"locale":"en","mode":"talk","topic":"hobby","adultConfirmed":false}`,
		`{"type":"turn.text","version":2,"turnId":1,"generation":0,"text":"Hello"}`,
		`{"type":"turn.text","version":2,"turnId":1,"generation":1,"text":null}`,
		`{"type":"turn.commit","version":2,"turnId":1,"generation":1,"Generation":2}`,
		`{"type":"turn.action","version":2,"turnId":1,"generation":1,"responseId":"r","actionId":"run_code"}`,
		`{"type":"panel.dismiss","version":2,"generation":1,"responseId":"r","url":"https://example.com"}`,
	} {
		if _, err := parseHarnessCommand([]byte(message)); err == nil {
			t.Fatalf("invalid harness command accepted: %s", message)
		}
	}
	if _, err := parseHarnessCommand([]byte(`{"type":"panel.dismiss","version":2,"generation":0,"responseId":"r"}`)); err != nil {
		t.Fatal("panel.dismiss parser disagrees with the nonnegative generation contract")
	}
}

func TestHarnessReadingUsesTheBoundedSessionLifetime(t *testing.T) {
	legacy := &session{}
	harness := &session{harness: &harnessState{}}
	if legacy.idleTimeout() != 45*time.Second {
		t.Fatal("legacy idle policy changed")
	}
	if harness.idleTimeout() != maxSessionSeconds*time.Second {
		t.Fatal("harness reading was cut short before its bounded session lifetime")
	}
}
