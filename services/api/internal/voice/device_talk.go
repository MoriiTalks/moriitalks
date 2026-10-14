package voice

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"time"
	"unicode"
	"unicode/utf8"
)

type deviceTalkConfiguration struct {
	Version   int    `json:"version"`
	Enabled   bool   `json:"enabled"`
	AdultOnly bool   `json:"adultOnly"`
	Input     string `json:"input"`
	Output    string `json:"output"`
	Limits    Limits `json:"limits"`
}

// OS speech services may use their own network, Morii's server receives only accepted text.
func (s *Server) deviceTalkConfiguration(w http.ResponseWriter, r *http.Request) {
	if origin := r.Header.Get("Origin"); origin != "" {
		if !s.allowedOrigin(origin) {
			http.Error(w, "Origin is not allowed", http.StatusForbidden)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(deviceTalkConfiguration{Version: 2, Enabled: s.config.deviceTalkEnabled(), AdultOnly: true, Input: "device", Output: "device", Limits: s.limits(false)})
}

func (s *Server) connectDeviceTalk(w http.ResponseWriter, r *http.Request) {
	s.connectSession(w, r, 2, true)
}

func (s *session) limits() Limits {
	return s.server.limits(!s.deviceTalk && s.kind == "live")
}

type deviceHarnessCoach struct{ cloud *cloudProviders }

func newDeviceHarnessCoach(config Config) *deviceHarnessCoach {
	cloud := newCloudProviders(config)
	// Hermes can complete a bounded reply more slowly than cloud speech providers.
	transport, ok := cloud.client.Transport.(*http.Transport)
	if ok {
		transport = transport.Clone()
		transport.ResponseHeaderTimeout = 20 * time.Second
		cloud.client.Transport = transport
	}
	return &deviceHarnessCoach{cloud: cloud}
}

// This adult development path has local guards, it is not a production child-safety substitute.
func (p *deviceHarnessCoach) RespondHarness(ctx context.Context, input harnessInput) (harnessReply, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	if !p.cloud.config.deviceTalkEnabled() || !boundedCoachInput(input) {
		return harnessReply{}, errLimit
	}
	if !safeDeviceTalkInput(input) {
		return harnessReply{}, errUnsafe
	}
	if p.cloud.config.OpenAIKey != "" {
		if err := p.cloud.moderate(ctx, input.Speech); err != nil {
			return harnessReply{}, err
		}
	}
	encoded, err := json.Marshal(input)
	if err != nil {
		return harnessReply{}, errProvider
	}
	completion, err := p.cloud.completeDeviceHermesStream(ctx, newHarnessRequest(string(encoded), p.cloud.config))
	if err != nil {
		return harnessReply{}, err
	}
	result, err := decodeHarnessReply([]byte(completion.Text))
	if err != nil {
		return harnessReply{}, err
	}
	if err := validateHarnessReply(result, input); err != nil {
		return harnessReply{}, err
	}
	if !safeDeviceTalkText(harnessVisibleText(result), 2000) {
		return harnessReply{}, errUnsafe
	}
	if p.cloud.config.OpenAIKey != "" {
		if err := p.cloud.moderate(ctx, harnessVisibleText(result)); err != nil {
			return harnessReply{}, err
		}
	}
	result.InputTokens, result.OutputTokens = completion.InputTokens, completion.OutputTokens
	return result, nil
}

func safeDeviceTalkInput(input harnessInput) bool {
	if (input.Language != "id" && input.Language != "en") || (input.Mode != "talk" && input.Mode != "practice") || !knownTopic(input.Topic) || !safeDeviceTalkText(input.Speech, 1000) {
		return false
	}
	for _, turn := range input.History {
		if !safeDeviceTalkText(turn.Speech, 1000) || (turn.HeardReply != "" && !safeDeviceTalkText(turn.HeardReply, 400)) {
			return false
		}
		if panelText := harnessPanelContextText(turn.Panel); turn.Panel != nil && !safeDeviceTalkText(panelText, maxHarnessPanelContext) {
			return false
		}
	}
	return true
}

var devicePrivateText = regexp.MustCompile(`(?i)([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(?:\+?[0-9][ .()-]*){10,}|password|kata sandi|alamat rumah|home address|nomor telepon|nomor ponsel|phone number|api key|private key)`)

// Reject obvious contact details and control syntax, names cannot be reliably detected from text.
func safeDeviceTalkText(text string, maximum int) bool {
	if !utf8.ValidString(text) || !safeVisibleText(text, maximum) || devicePrivateText.MatchString(text) {
		return false
	}
	for _, value := range text {
		if (unicode.IsControl(value) && value != '\n' && value != '\t') || unicode.Is(unicode.Cf, value) {
			return false
		}
	}
	return true
}
