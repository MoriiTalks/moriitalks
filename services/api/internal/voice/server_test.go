package voice

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func labConfig() Config {
	return Config{Enabled: true, DeepgramKey: "test", OpenAIKey: "test", AzureKey: "test", AzureRegion: "eastus", AzureVoice: "en-US-AvaMultilingualNeural", MaxSessionUSD: 0.50, MaxLabUSD: 5}
}

// fakeProviders counts pipeline calls and exposes barriers for cancellation tests.
type fakeProviders struct {
	listens, responses, speech atomic.Int32
	respondStarted             chan struct{}
	respondRelease             chan struct{}
	responseError              error
	listenStarted              chan struct{}
	listenRelease              chan struct{}
}

func (p *fakeProviders) Listen(ctx context.Context, _ sessionOptions, _ audioFormat, _ func(string)) (transcription, error) {
	p.listens.Add(1)
	if p.listenStarted != nil {
		p.listenStarted <- struct{}{}
		select {
		case <-p.listenRelease:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return fakeTranscription{}, nil
}
func (p *fakeProviders) Respond(ctx context.Context, _ sessionOptions, _ string) (reply, error) {
	p.responses.Add(1)
	if p.respondStarted != nil {
		p.respondStarted <- struct{}{}
		select {
		case <-p.respondRelease:
		case <-ctx.Done():
			return reply{}, ctx.Err()
		}
	}
	return reply{Text: "Add one reason, then try again.", InputTokens: 12, OutputTokens: 8}, p.responseError
}
func (p *fakeProviders) Speak(context.Context, sessionOptions, string) ([]byte, error) {
	p.speech.Add(1)
	return []byte("ID3fake-audio"), nil
}

type fakeTranscription struct{}

func (fakeTranscription) Send(context.Context, []byte) error     { return nil }
func (fakeTranscription) Finish(context.Context) (string, error) { return "I enjoy drawing.", nil }
func (fakeTranscription) Close()                                 {}

func testServer(t *testing.T, config Config, provider providers) (*Server, *httptest.Server) {
	t.Helper()
	lab := NewServer(config)
	if provider != nil {
		lab.providers = provider
	}
	mux := http.NewServeMux()
	lab.Register(mux)
	server := httptest.NewServer(mux)
	t.Cleanup(func() { lab.Close(); server.Close() })
	return lab, server
}

type testClient struct {
	t          *testing.T
	connection *websocket.Conn
	ctx        context.Context
	sequence   int
}

func connectClient(t *testing.T, server *httptest.Server) *testClient {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	connection, _, err := websocket.Dial(ctx, server.URL+"/v1/voice", nil)
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	t.Cleanup(func() { connection.CloseNow(); cancel() })
	return &testClient{t: t, connection: connection, ctx: ctx}
}

func (c *testClient) send(data string) {
	c.t.Helper()
	if err := c.connection.Write(c.ctx, websocket.MessageText, []byte(data)); err != nil {
		c.t.Fatal(err)
	}
}
func (c *testClient) audio(data []byte) {
	c.t.Helper()
	if err := c.connection.Write(c.ctx, websocket.MessageBinary, data); err != nil {
		c.t.Fatal(err)
	}
}
func (c *testClient) next() event {
	c.t.Helper()
	for {
		kind, data, err := c.connection.Read(c.ctx)
		if err != nil {
			c.t.Fatal(err)
		}
		if kind == websocket.MessageBinary {
			if string(data) != "ID3fake-audio" {
				c.t.Fatalf("unexpected audio %q", data)
			}
			continue
		}
		var value event
		if err := json.Unmarshal(data, &value); err != nil {
			c.t.Fatal(err)
		}
		c.sequence++
		if value.Version != 1 || value.Sequence != c.sequence {
			c.t.Fatalf("invalid envelope: %+v", value)
		}
		return value
	}
}
func (c *testClient) until(kind string) event {
	c.t.Helper()
	for range 12 {
		value := c.next()
		if value.Type == kind {
			return value
		}
		if value.Type == "error" {
			c.t.Fatalf("unexpected error: %+v", value)
		}
	}
	c.t.Fatalf("event %s did not arrive", kind)
	return event{}
}
func (c *testClient) start(adult bool) event {
	c.t.Helper()
	data := `{"type":"session.start","version":1,"locale":"en","mode":"practice","topic":"hobby","adultConfirmed":false}`
	if adult {
		data = strings.Replace(data, "false", "true", 1)
	}
	c.send(data)
	return c.until("session.ready")
}
func (c *testClient) record(id string) {
	c.t.Helper()
	c.send(`{"type":"turn.start","turnId":` + id + `,"sampleRate":16000,"channels":1,"encoding":"pcm_s16le"}`)
	c.until("turn.state")
	c.audio(make([]byte, 3200))
	c.send(`{"type":"turn.commit","turnId":` + id + `}`)
}

func TestConfigurationMatchesFixture(t *testing.T) {
	_, server := testServer(t, Config{}, nil)
	response, err := http.Get(server.URL + "/v1/voice/config")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var got configurationResponse
	decoder := json.NewDecoder(response.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&got); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile("../../../../packages/contracts/voice.config.example.json")
	if err != nil {
		t.Fatal(err)
	}
	var want configurationResponse
	decoder = json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&want); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("config = %v, want %v", got, want)
	}
	if response.Header.Get("Cache-Control") != "no-store" {
		t.Fatal("configuration must not be cached")
	}
}

func TestEventsPreserveContractFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/contracts/voice.events.example.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []json.RawMessage
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, fixture := range fixtures {
		var value event
		decoder := json.NewDecoder(strings.NewReader(string(fixture)))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&value); err != nil {
			t.Fatal(err)
		}
		encoded, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		var compact bytes.Buffer
		if err := json.Compact(&compact, fixture); err != nil {
			t.Fatal(err)
		}
		var got, want map[string]json.RawMessage
		if err := json.Unmarshal(encoded, &got); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(compact.Bytes(), &want); err != nil {
			t.Fatal(err)
		}
		if len(got) != len(want) {
			t.Fatalf("event fields changed: %s", encoded)
		}
		for key, value := range want {
			if !bytes.Equal(got[key], value) {
				t.Fatalf("event field %s changed: %s", key, encoded)
			}
		}
	}
}

func TestPreviewNeedsNoKeysAndNeverCallsProviders(t *testing.T) {
	for _, tc := range []struct {
		name   string
		config Config
		adult  bool
	}{
		{"default", Config{}, true}, {"adult confirmation absent", labConfig(), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			provider := &fakeProviders{}
			_, server := testServer(t, tc.config, provider)
			client := connectClient(t, server)
			if got := client.start(tc.adult).Kind; got != "preview" {
				t.Fatalf("kind = %s", got)
			}
			client.send(`{"type":"demo.turn","turnId":1,"example":"brief"}`)
			transcript := client.until("transcript")
			if transcript.Text != "I like drawing." || transcript.Final == nil || !*transcript.Final {
				t.Fatalf("transcript = %+v", transcript)
			}
			response := client.until("turn.response")
			if response.Source != "script" {
				t.Fatalf("source = %s", response.Source)
			}
			client.until("turn.state")
			client.audio([]byte{0, 0})
			if got := client.next(); got.Type != "error" || got.Code != "invalid_message" {
				t.Fatalf("unexpected event %+v", got)
			}
			client.send(`{"type":"demo.turn","turnId":1,"example":"brief"}`)
			client.send(`{"type":"session.close"}`)
			if got := client.next(); got.Type != "session.closed" {
				t.Fatalf("duplicate demo was repeated: %+v", got)
			}
			if provider.listens.Load() != 0 || provider.responses.Load() != 0 || provider.speech.Load() != 0 {
				t.Fatal("preview called a provider")
			}
		})
	}
}

func TestLiveTurnAndDuplicateCommands(t *testing.T) {
	provider := &fakeProviders{}
	_, server := testServer(t, labConfig(), provider)
	client := connectClient(t, server)
	ready := client.start(true)
	if ready.Kind != "live" || ready.Limits == nil || ready.Limits.MaxTurns != 5 {
		t.Fatalf("live ready = %+v", ready)
	}
	client.record("1")
	client.send(`{"type":"turn.commit","turnId":1}`)
	response := client.until("turn.response")
	if response.Source != "ai" {
		t.Fatalf("source = %s", response.Source)
	}
	metrics := client.until("turn.metrics")
	if metrics.AudioSeconds == nil || *metrics.AudioSeconds != 0.1 || metrics.InputTokens == nil || *metrics.InputTokens != 12 {
		t.Fatalf("metrics = %+v", metrics)
	}
	client.until("turn.state")
	client.send(`{"type":"turn.start","turnId":1,"sampleRate":16000,"channels":1,"encoding":"pcm_s16le"}`)
	client.send(`{"type":"turn.commit","turnId":1}`)
	client.send(`{"type":"session.close"}`)
	if got := client.next(); got.Type != "session.closed" {
		t.Fatalf("duplicate turn repeated: %+v", got)
	}
	if provider.listens.Load() != 1 || provider.responses.Load() != 1 || provider.speech.Load() != 1 {
		t.Fatal("duplicate provider call")
	}
}

func TestCancellationSuppressesResponseAndAudio(t *testing.T) {
	provider := &fakeProviders{respondStarted: make(chan struct{}, 1), respondRelease: make(chan struct{})}
	_, server := testServer(t, labConfig(), provider)
	client := connectClient(t, server)
	client.start(true)
	client.record("1")
	select {
	case <-provider.respondStarted:
	case <-client.ctx.Done():
		t.Fatal("coach did not start")
	}
	client.send(`{"type":"turn.cancel","turnId":1}`)
	client.until("turn.cancelled")
	close(provider.respondRelease)
	client.send(`{"type":"session.close"}`)
	if got := client.next(); got.Type != "session.closed" {
		t.Fatalf("stale output: %+v", got)
	}
	if provider.speech.Load() != 0 {
		t.Fatal("cancelled turn synthesized audio")
	}
}

func TestCommittedTurnCanDrainAfterCaptureDeadline(t *testing.T) {
	provider := &fakeProviders{listenStarted: make(chan struct{}, 1), listenRelease: make(chan struct{})}
	lab, server := testServer(t, labConfig(), provider)
	lab.captureTimeout = 40 * time.Millisecond
	client := connectClient(t, server)
	client.start(true)
	client.record("1")
	client.until("turn.state")
	select {
	case <-provider.listenStarted:
	case <-client.ctx.Done():
		t.Fatal("STT did not start")
	}
	// The commit is acknowledged before the capture deadline, STT remains delayed.
	timer := time.NewTimer(80 * time.Millisecond)
	defer timer.Stop()
	select {
	case <-timer.C:
	case <-client.ctx.Done():
		t.Fatal("test deadline exceeded")
	}
	close(provider.listenRelease)
	client.until("turn.metrics")
	client.until("turn.state")
	if provider.responses.Load() != 1 || provider.speech.Load() != 1 {
		t.Fatal("committed turn was dropped while draining")
	}
}

func TestUncommittedTurnExpiresAtCaptureDeadline(t *testing.T) {
	provider := &fakeProviders{}
	lab, server := testServer(t, labConfig(), provider)
	lab.captureTimeout = 20 * time.Millisecond
	client := connectClient(t, server)
	client.start(true)
	client.send(`{"type":"turn.start","turnId":1,"sampleRate":16000,"channels":1,"encoding":"pcm_s16le"}`)
	client.until("turn.state")
	value := client.until("error")
	if value.Code != "limit" {
		t.Fatalf("capture timeout event: %+v", value)
	}
	if provider.responses.Load() != 0 || provider.speech.Load() != 0 {
		t.Fatal("uncommitted capture reached coaching")
	}
}

func TestUnsafeResponseNeverReachesClientOrTTS(t *testing.T) {
	provider := &fakeProviders{responseError: errUnsafe}
	_, server := testServer(t, labConfig(), provider)
	client := connectClient(t, server)
	client.start(true)
	client.record("1")
	client.until("turn.state")
	value := client.until("error")
	if value.Type != "error" || value.Code != "unsafe" {
		t.Fatalf("unexpected event: %+v", value)
	}
	if provider.speech.Load() != 0 {
		t.Fatal("unsafe output reached TTS")
	}
}

func TestBudgetIsReservedBeforeProviderAndNotRefunded(t *testing.T) {
	// The fake verifies admission accounting without measuring external charges.
	config := labConfig()
	config.MaxLabUSD = turnReserveUSD
	provider := &fakeProviders{}
	_, server := testServer(t, config, provider)
	first := connectClient(t, server)
	first.start(true)
	first.record("1")
	first.until("turn.metrics")
	first.until("turn.state")
	second := connectClient(t, server)
	second.start(true)
	second.send(`{"type":"turn.start","turnId":1,"sampleRate":16000,"channels":1,"encoding":"pcm_s16le"}`)
	if got := second.next(); got.Type != "error" || got.Code != "limit" || got.Recoverable == nil || *got.Recoverable {
		t.Fatalf("budget error = %+v", got)
	}
	if provider.listens.Load() != 1 {
		t.Fatal("budget was checked after provider call")
	}
}

func TestAudioRejectsMalformedFrames(t *testing.T) {
	provider := &fakeProviders{}
	_, server := testServer(t, labConfig(), provider)
	client := connectClient(t, server)
	client.start(true)
	client.send(`{"type":"turn.start","turnId":1,"sampleRate":16000,"channels":1,"encoding":"pcm_s16le"}`)
	client.until("turn.state")
	client.audio([]byte{1})
	if got := client.next(); got.Code != "invalid_message" {
		t.Fatalf("malformed audio accepted: %+v", got)
	}
	if provider.responses.Load() != 0 || provider.speech.Load() != 0 {
		t.Fatal("malformed audio reached coach")
	}
}

func TestSessionAdmissionAndShutdown(t *testing.T) {
	lab, server := testServer(t, Config{}, nil)
	for range 5 {
		connectClient(t, server)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, response, err := websocket.Dial(ctx, server.URL+"/v1/voice", nil)
	if err == nil || response == nil || response.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("sixth session: response=%v, error=%v", response, err)
	}
	lab.Close()
	client := &http.Client{Timeout: time.Second}
	if _, err := client.Get(server.URL + "/v1/voice/config"); err != nil {
		t.Fatal(err)
	}
}

func TestRemoteBrowserOriginIsRejected(t *testing.T) {
	_, server := testServer(t, Config{}, nil)
	for _, path := range []string{"/v1/voice/config", "/v1/voice"} {
		request, err := http.NewRequest(http.MethodGet, server.URL+path, nil)
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Origin", "https://untrusted.example")
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != http.StatusForbidden {
			t.Fatalf("remote origin accepted: %s", path)
		}
	}
}

func TestProtocolRejectsInvalidMessages(t *testing.T) {
	for _, message := range []string{
		`{"type":"session.start","version":2,"locale":"en","mode":"talk","topic":"hobby","adultConfirmed":true}`,
		`{"type":"session.start","version":1,"locale":"en","mode":"talk","topic":"hobby"}`,
		`{"type":"session.start","version":1,"locale":"en","mode":"talk","topic":"hobby","adultConfirmed":null}`,
		`{"type":"session.start","version":1,"locale":"en","mode":"talk","topic":"hobby","adultConfirmed":false,"adultConfirmed":true}`,
		`{"type":"session.start","version":1,"locale":"en","mode":"talk","topic":"hobby","adultConfirmed":false,"adult\u0043onfirmed":true}`,
		`{"type":"session.close","type":"session.close"}`,
		`{"type":"turn.commit","turnId":0}`,
		`{"type":"turn.commit","turnId":9}`,
		`{"type":"turn.commit","turnId":1,"topic":"hobby"}`,
		`{"type":"turn.start","turnId":1,"sampleRate":16000,"channels":2,"encoding":"pcm_s16le"}`,
		`{"type":"demo.turn","turnId":1,"example":"arbitrary"}`,
		`{"type":"session.close"} {"type":"session.close"}`,
	} {
		if _, err := parseMessage([]byte(message)); err == nil {
			t.Errorf("invalid message accepted: %s", message)
		}
	}
	if _, err := parseMessage([]byte(`{"type":"session.close"}`)); err != nil {
		t.Fatal(err)
	}
}

func TestLiveLimitsMatchAdmissionBudget(t *testing.T) {
	for _, tc := range []struct {
		budget float64
		turns  int
	}{
		{0.10, 1}, {0.20, 2}, {0.30, 3}, {0.50, 5},
	} {
		config := labConfig()
		config.MaxSessionUSD = tc.budget
		lab, server := testServer(t, config, &fakeProviders{})
		response, err := http.Get(server.URL + "/v1/voice/config")
		if err != nil {
			t.Fatal(err)
		}
		var value struct{ Limits }
		err = json.NewDecoder(response.Body).Decode(&value)
		response.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		if value.MaxTurns != tc.turns {
			t.Fatalf("budget %.2f advertised %d turns, want %d", tc.budget, value.MaxTurns, tc.turns)
		}
		client := connectClient(t, server)
		ready := client.start(true)
		if ready.Limits == nil || ready.Limits.MaxTurns != tc.turns {
			t.Fatalf("session limits differ from config: %+v", ready.Limits)
		}
		if got := lab.limits(false).MaxTurns; got != maxTurns {
			t.Fatalf("preview limit = %d", got)
		}
	}
}

func TestConfigDefaultsAndInvalidBudget(t *testing.T) {
	for _, key := range []string{"VOICE_LAB_ENABLED", "DEEPGRAM_API_KEY", "OPENAI_API_KEY", "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "AZURE_SPEECH_VOICE", "VOICE_MAX_SESSION_USD", "VOICE_MAX_LAB_USD"} {
		t.Setenv(key, "")
	}
	config, err := ConfigFromEnv()
	if err != nil || config.liveEnabled() || config.MaxSessionUSD != 0.50 || config.MaxLabUSD != 5 {
		t.Fatalf("unexpected defaults: enabled=%v, error=%v", config.liveEnabled(), err)
	}
	for _, amount := range []string{"NaN", "Inf", "-1", "0", "invalid", "0.51"} {
		t.Setenv("VOICE_MAX_SESSION_USD", amount)
		if _, err := ConfigFromEnv(); err == nil {
			t.Fatalf("invalid budget accepted: %s", amount)
		}
	}
	t.Setenv("VOICE_MAX_SESSION_USD", "0.50")
	t.Setenv("VOICE_LAB_ENABLED", "typo")
	if _, err := ConfigFromEnv(); err == nil {
		t.Fatal("invalid enable flag accepted")
	}
}
