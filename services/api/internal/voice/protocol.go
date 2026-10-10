package voice

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"unicode"
)

type clientMessage struct {
	Type           string `json:"type"`
	Version        int    `json:"version,omitempty"`
	Locale         string `json:"locale,omitempty"`
	Mode           string `json:"mode,omitempty"`
	Topic          string `json:"topic,omitempty"`
	AdultConfirmed bool   `json:"adultConfirmed,omitempty"`
	TurnID         int    `json:"turnId,omitempty"`
	SampleRate     int    `json:"sampleRate,omitempty"`
	Channels       int    `json:"channels,omitempty"`
	Encoding       string `json:"encoding,omitempty"`
	Example        string `json:"example,omitempty"`
}

type configurationResponse struct {
	Version     int  `json:"version"`
	LiveEnabled bool `json:"liveEnabled"`
	Limits
}

// parseMessage enforces the exact required field set for each client command.
func parseMessage(data []byte) (clientMessage, error) {
	var message clientMessage
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&message); err != nil {
		return message, err
	}
	if decoder.Decode(new(json.RawMessage)) != io.EOF {
		return message, errors.New("trailing JSON")
	}
	allowed := map[string]bool{"type": true}
	switch message.Type {
	case "session.start":
		for _, key := range []string{"version", "locale", "mode", "topic", "adultConfirmed"} {
			allowed[key] = true
		}
		if message.Version != 1 || (message.Locale != "id" && message.Locale != "en") ||
			(message.Mode != "talk" && message.Mode != "practice") ||
			(message.Topic != "hobby" && message.Topic != "day" && message.Topic != "ideas") {
			return message, errors.New("invalid session")
		}
	case "turn.start":
		for _, key := range []string{"turnId", "sampleRate", "channels", "encoding"} {
			allowed[key] = true
		}
		if message.SampleRate < 8000 || message.SampleRate > 48000 || message.Channels != 1 || message.Encoding != "pcm_s16le" {
			return message, errors.New("invalid audio format")
		}
	case "turn.commit", "turn.cancel":
		allowed["turnId"] = true
	case "demo.turn":
		allowed["turnId"], allowed["example"] = true, true
		if message.Example != "reason" && message.Example != "brief" {
			return message, errors.New("invalid example")
		}
	case "session.close":
	default:
		return message, errors.New("unknown message")
	}
	if message.Type != "session.start" && message.Type != "session.close" && (message.TurnID < 1 || message.TurnID > maxTurns) {
		return message, errors.New("invalid turn")
	}
	keys, err := uniqueFields(data)
	if err != nil {
		return message, err
	}
	if len(keys) != len(allowed) {
		return message, errors.New("missing required field")
	}
	for key := range keys {
		if !allowed[key] {
			return message, errors.New("unexpected field")
		}
	}
	return message, nil
}

// uniqueFields also rejects nulls, which otherwise decode as Go zero values.
func uniqueFields(data []byte) (map[string]json.RawMessage, error) {
	fields, err := objectFields(data)
	if err != nil {
		return nil, err
	}
	for _, value := range fields {
		if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return nil, errors.New("field cannot be null")
		}
	}
	return fields, nil
}

func objectFields(data []byte) (map[string]json.RawMessage, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	token, err := decoder.Token()
	if err != nil || token != json.Delim('{') {
		return nil, errors.New("message must be an object")
	}
	fields := make(map[string]json.RawMessage)
	seen := make(map[string]bool)
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		key, ok := token.(string)
		if !ok {
			return nil, errors.New("invalid field")
		}
		// JSON struct decoding accepts case aliases, so duplicates must include them.
		folded := foldJSONKey(key)
		if seen[folded] {
			return nil, errors.New("duplicate field")
		}
		seen[folded] = true
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return nil, err
		}
		fields[key] = value
	}
	if _, err := decoder.Token(); err != nil {
		return nil, err
	}
	if decoder.Decode(new(json.RawMessage)) != io.EOF {
		return nil, errors.New("trailing JSON")
	}
	return fields, nil
}

// foldJSONKey canonicalizes Unicode case aliases before duplicate checks.
func foldJSONKey(key string) string {
	return strings.Map(func(character rune) rune {
		canonical := character
		for next := unicode.SimpleFold(character); next != character; next = unicode.SimpleFold(next) {
			canonical = min(canonical, next)
		}
		return canonical
	}, key)
}

// event is the versioned server envelope. Pointers retain optional false and zero values.
type event struct {
	Version       int      `json:"version"`
	Sequence      int      `json:"sequence"`
	Type          string   `json:"type"`
	SessionID     string   `json:"sessionId,omitempty"`
	Kind          string   `json:"kind,omitempty"`
	Limits        *Limits  `json:"limits,omitempty"`
	TurnID        int      `json:"turnId,omitempty"`
	Text          string   `json:"text,omitempty"`
	Final         *bool    `json:"final,omitempty"`
	State         string   `json:"state,omitempty"`
	Source        string   `json:"source,omitempty"`
	Format        string   `json:"format,omitempty"`
	Bytes         int      `json:"bytes,omitempty"`
	Code          string   `json:"code,omitempty"`
	Message       string   `json:"message,omitempty"`
	Recoverable   *bool    `json:"recoverable,omitempty"`
	Reason        string   `json:"reason,omitempty"`
	STTMs         *int64   `json:"sttMs,omitempty"`
	CoachMs       *int64   `json:"coachMs,omitempty"`
	TTSMs         *int64   `json:"ttsMs,omitempty"`
	TotalMs       *int64   `json:"totalMs,omitempty"`
	AudioSeconds  *float64 `json:"audioSeconds,omitempty"`
	InputTokens   *int     `json:"inputTokens,omitempty"`
	OutputTokens  *int     `json:"outputTokens,omitempty"`
	TTSCharacters *int     `json:"ttsCharacters,omitempty"`
}

func pointer[T comparable](value T) *T { return &value }
