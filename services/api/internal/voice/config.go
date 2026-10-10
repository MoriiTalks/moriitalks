package voice

import (
	"errors"
	"math"
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
)

// Config holds server-side provider credentials and voice lab admission budgets.
type Config struct {
	Enabled       bool
	DeepgramKey   string
	OpenAIKey     string
	AzureKey      string
	AzureRegion   string
	AzureVoice    string
	MaxSessionUSD float64
	MaxLabUSD     float64
}

// ConfigFromEnv loads lab settings and rejects unsupported budgets or voices.
func ConfigFromEnv() (Config, error) {
	if value := os.Getenv("VOICE_LAB_ENABLED"); value != "" && value != "true" && value != "false" {
		return Config{}, errors.New("VOICE_LAB_ENABLED must be true or false")
	}
	c := Config{
		Enabled:       os.Getenv("VOICE_LAB_ENABLED") == "true",
		DeepgramKey:   strings.TrimSpace(os.Getenv("DEEPGRAM_API_KEY")),
		OpenAIKey:     strings.TrimSpace(os.Getenv("OPENAI_API_KEY")),
		AzureKey:      strings.TrimSpace(os.Getenv("AZURE_SPEECH_KEY")),
		AzureRegion:   strings.TrimSpace(os.Getenv("AZURE_SPEECH_REGION")),
		AzureVoice:    strings.TrimSpace(os.Getenv("AZURE_SPEECH_VOICE")),
		MaxSessionUSD: 0.50,
		MaxLabUSD:     5.00,
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
	return c.Enabled && c.DeepgramKey != "" && c.OpenAIKey != "" && c.AzureKey != "" && c.AzureRegion != ""
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
