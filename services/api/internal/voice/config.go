package voice

import (
	"errors"
	"math"
	"net"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
)

const (
	maxSessionSeconds = 300
	maxTurnSeconds    = 30
	maxTurns          = 8
	maxAudioBytes     = 512 * 1024
	turnReserveUSD    = 0.10
	defaultCoachModel = "gpt-6-luna"
)

// Config holds server-side provider credentials and voice lab admission budgets.
type Config struct {
	Enabled                bool
	DeepgramKey            string
	OpenAIKey              string
	CoachProvider          string
	CoachModel             string
	CoachReasoning         string
	HermesURL              string
	HermesKey              string
	HermesProvider         string
	HermesRoute            string
	HermesNoToolsConfirmed bool
	AzureKey               string
	AzureRegion            string
	AzureVoice             string
	MaxSessionUSD          float64
	MaxLabUSD              float64
}

// ConfigFromEnv loads lab settings and rejects unsupported budgets or voices.
func ConfigFromEnv() (Config, error) {
	if value := os.Getenv("VOICE_LAB_ENABLED"); value != "" && value != "true" && value != "false" {
		return Config{}, errors.New("VOICE_LAB_ENABLED must be true or false")
	}
	c := Config{
		Enabled:                os.Getenv("VOICE_LAB_ENABLED") == "true",
		DeepgramKey:            strings.TrimSpace(os.Getenv("DEEPGRAM_API_KEY")),
		OpenAIKey:              strings.TrimSpace(os.Getenv("OPENAI_API_KEY")),
		CoachProvider:          envDefault("VOICE_COACH_PROVIDER", "openai"),
		CoachModel:             envDefault("VOICE_COACH_MODEL", defaultCoachModel),
		CoachReasoning:         envDefault("VOICE_COACH_REASONING", "none"),
		HermesURL:              strings.TrimRight(strings.TrimSpace(os.Getenv("HERMES_API_URL")), "/"),
		HermesKey:              strings.TrimSpace(os.Getenv("HERMES_API_KEY")),
		HermesProvider:         envDefault("HERMES_PROVIDER", "openai-codex"),
		HermesRoute:            strings.TrimSpace(os.Getenv("HERMES_MODEL_ROUTE")),
		HermesNoToolsConfirmed: os.Getenv("HERMES_NO_TOOLS_CONFIRMED") == "true",
		AzureKey:               strings.TrimSpace(os.Getenv("AZURE_SPEECH_KEY")),
		AzureRegion:            strings.TrimSpace(os.Getenv("AZURE_SPEECH_REGION")),
		AzureVoice:             strings.TrimSpace(os.Getenv("AZURE_SPEECH_VOICE")),
		MaxSessionUSD:          0.50,
		MaxLabUSD:              5.00,
	}
	if value := os.Getenv("HERMES_NO_TOOLS_CONFIRMED"); value != "" && value != "true" && value != "false" {
		return Config{}, errors.New("HERMES_NO_TOOLS_CONFIRMED must be true or false")
	}
	if err := c.validateCoach(); err != nil {
		return Config{}, err
	}
	if c.AzureVoice == "" {
		c.AzureVoice = "en-US-AvaMultilingualNeural"
	}
	if value := os.Getenv("VOICE_MAX_SESSION_USD"); value != "" {
		amount, err := strconv.ParseFloat(value, 64)
		if err != nil || !(amount >= turnReserveUSD && amount <= 0.50) {
			return Config{}, errors.New("VOICE_MAX_SESSION_USD must be between 0.10 and 0.50")
		}
		c.MaxSessionUSD = amount
	}
	if value := os.Getenv("VOICE_MAX_LAB_USD"); value != "" {
		amount, err := strconv.ParseFloat(value, 64)
		if err != nil || !(amount >= turnReserveUSD && amount <= 5.00) {
			return Config{}, errors.New("VOICE_MAX_LAB_USD must be between 0.10 and 5.00")
		}
		c.MaxLabUSD = amount
	}
	if c.AzureRegion != "" && !regexp.MustCompile(`^[a-z0-9]{1,40}$`).MatchString(c.AzureRegion) {
		return Config{}, errors.New("AZURE_SPEECH_REGION is invalid")
	}
	if c.AzureVoice != "en-US-AvaMultilingualNeural" && c.AzureVoice != "en-US-AndrewMultilingualNeural" {
		return Config{}, errors.New("AZURE_SPEECH_VOICE must be an approved multilingual voice")
	}
	return c, nil
}

// Live access needs both explicit enablement and a complete provider setup.
func (c Config) liveEnabled() bool {
	return c.Enabled && c.DeepgramKey != "" && c.OpenAIKey != "" && c.AzureKey != "" && c.AzureRegion != "" && c.coachConfigured()
}

func envDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func (c Config) coachProvider() string {
	if c.CoachProvider == "" {
		return "openai"
	}
	return c.CoachProvider
}

func (c Config) coachModel() string {
	if c.CoachModel == "" {
		return defaultCoachModel
	}
	return c.CoachModel
}

func (c Config) coachReasoning() string {
	if c.CoachReasoning == "" {
		return "none"
	}
	return c.CoachReasoning
}

func (c Config) hermesProvider() string {
	if c.HermesProvider == "" {
		return "openai-codex"
	}
	return c.HermesProvider
}

// Hermes tool isolation is configured externally, the flag records an adult setup check.
func (c Config) coachConfigured() bool {
	if c.validateCoach() != nil {
		return false
	}
	if c.coachProvider() == "hermes" {
		return c.HermesURL != "" && c.HermesKey != "" && c.HermesNoToolsConfirmed
	}
	return c.OpenAIKey != ""
}

func (c Config) validateCoach() error {
	if c.coachProvider() != "openai" && c.coachProvider() != "hermes" {
		return errors.New("VOICE_COACH_PROVIDER must be openai or hermes")
	}
	identifier := regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$`)
	if !identifier.MatchString(c.coachModel()) {
		return errors.New("VOICE_COACH_MODEL is invalid")
	}
	if c.coachReasoning() != "none" && c.coachReasoning() != "low" {
		return errors.New("VOICE_COACH_REASONING must be none or low")
	}
	if !regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`).MatchString(c.hermesProvider()) {
		return errors.New("HERMES_PROVIDER is invalid")
	}
	if c.HermesRoute != "" && !identifier.MatchString(c.HermesRoute) {
		return errors.New("HERMES_MODEL_ROUTE is invalid")
	}
	if c.HermesURL != "" {
		endpoint, err := url.Parse(c.HermesURL)
		if err != nil || endpoint.Hostname() == "" || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.ForceQuery || endpoint.Fragment != "" || endpoint.RawPath != "" || !strings.HasSuffix(endpoint.Path, "/v1") {
			return errors.New("HERMES_API_URL must be an API base URL ending in /v1")
		}
		ip := net.ParseIP(endpoint.Hostname())
		loopback := endpoint.Hostname() == "localhost" || (ip != nil && ip.IsLoopback())
		if endpoint.Scheme != "https" && !(endpoint.Scheme == "http" && loopback) {
			return errors.New("HERMES_API_URL requires HTTPS outside loopback")
		}
	}
	return nil
}

// Limits describes the session duration and turn count advertised to clients.
type Limits struct {
	MaxSessionSeconds int `json:"maxSessionSeconds"`
	MaxTurnSeconds    int `json:"maxTurnSeconds"`
	MaxTurns          int `json:"maxTurns"`
}

func (s *Server) limits(live bool) Limits {
	turns := maxTurns
	if live {
		// The epsilon avoids losing a turn to floating-point budget rounding.
		turns = min(turns, int(math.Floor((s.config.MaxSessionUSD+0.000001)/turnReserveUSD)))
	}
	return Limits{maxSessionSeconds, maxTurnSeconds, turns}
}
