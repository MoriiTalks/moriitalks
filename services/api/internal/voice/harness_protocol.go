package voice

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

// Harness commands carry a generation and response identity instead of arbitrary UI code.
type harnessCommand struct {
	Type           string `json:"type"`
	Version        int    `json:"version"`
	Locale         string `json:"locale"`
	Mode           string `json:"mode"`
	Topic          string `json:"topic"`
	AdultConfirmed bool   `json:"adultConfirmed"`
	TurnID         int    `json:"turnId"`
	Generation     int    `json:"generation"`
	SampleRate     int    `json:"sampleRate"`
	Channels       int    `json:"channels"`
	Encoding       string `json:"encoding"`
	Text           string `json:"text"`
	ResponseID     string `json:"responseId"`
	ActionID       string `json:"actionId"`
}

func (s *Server) harnessConfiguration(w http.ResponseWriter, r *http.Request) {
	s.configurationVersion(w, r, 2)
}

func (s *Server) connectHarness(w http.ResponseWriter, r *http.Request) {
	s.connectVersion(w, r, 2)
}

func parseHarnessCommand(data []byte) (harnessCommand, error) {
	var command harnessCommand
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&command) != nil || decoder.Decode(new(json.RawMessage)) != io.EOF || command.Version != 2 {
		return command, errProvider
	}
	keys := []string{"type", "version"}
	switch command.Type {
	case "session.start":
		keys = append(keys, "locale", "mode", "topic", "adultConfirmed")
		if (command.Locale != "id" && command.Locale != "en") || (command.Mode != "talk" && command.Mode != "practice") || !knownTopic(command.Topic) {
			return command, errProvider
		}
	case "session.close":
	case "turn.start":
		keys = append(keys, "turnId", "generation", "sampleRate", "channels", "encoding")
		if command.SampleRate < 8000 || command.SampleRate > 48000 || command.Channels != 1 || command.Encoding != "pcm_s16le" {
			return command, errProvider
		}
	case "turn.commit", "turn.cancel":
		keys = append(keys, "turnId", "generation")
	case "turn.text":
		keys = append(keys, "turnId", "generation", "text")
		if strings.TrimSpace(command.Text) == "" || textUnits(command.Text) > 1000 {
			return command, errProvider
		}
	case "turn.action":
		keys = append(keys, "turnId", "generation", "responseId", "actionId")
		if !knownAction(command.ActionID) || !validResponseID(command.ResponseID) {
			return command, errProvider
		}
	case "response.played":
		keys = append(keys, "turnId", "generation", "responseId")
		if !validResponseID(command.ResponseID) {
			return command, errProvider
		}
	case "panel.dismiss":
		keys = append(keys, "generation", "responseId")
		if !validResponseID(command.ResponseID) {
			return command, errProvider
		}
	default:
		return command, errProvider
	}
	if command.Type != "session.start" && command.Type != "session.close" {
		minimumGeneration := 1
		if command.Type == "panel.dismiss" {
			minimumGeneration = 0
		}
		if command.Generation < minimumGeneration || command.Generation > 9007199254740991 || (command.Type != "panel.dismiss" && (command.TurnID < 1 || command.TurnID > maxTurns)) {
			return command, errProvider
		}
	}
	fields, err := uniqueFields(data)
	if err != nil || !exactFields(fields, keys...) {
		return command, errProvider
	}
	return command, nil
}

func exactFields(fields map[string]json.RawMessage, keys ...string) bool {
	if len(fields) != len(keys) {
		return false
	}
	for _, key := range keys {
		if fields[key] == nil {
			return false
		}
	}
	return true
}

func validResponseID(value string) bool { return value != "" && textUnits(value) <= 128 }
func knownTopic(value string) bool      { return value == "hobby" || value == "day" || value == "ideas" }
func knownAction(value string) bool {
	return knownTopic(value) || value == "hint" || value == "outline" || value == "retry" || value == "finish" || value == "start_mission" || value == "end_session"
}
