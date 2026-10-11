package voice

import (
	"encoding/json"
	"strings"
)

type harnessChoice struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// Each panel has an exact field set checked before it can reach the interface.
type harnessPanel struct {
	Type        string          `json:"type"`
	Title       string          `json:"title,omitempty"`
	Text        string          `json:"text,omitempty"`
	Choices     []harnessChoice `json:"choices,omitempty"`
	Parts       []string        `json:"parts,omitempty"`
	Quote       string          `json:"quote,omitempty"`
	Observation string          `json:"observation,omitempty"`
	NextStep    string          `json:"nextStep,omitempty"`
	RubricID    string          `json:"rubricId,omitempty"`
	Status      string          `json:"status,omitempty"`
	MissionID   string          `json:"missionId,omitempty"`
}

type harnessReply struct {
	Text         string        `json:"text"`
	Animation    string        `json:"animation"`
	Panel        *harnessPanel `json:"panel"`
	InputTokens  int           `json:"-"`
	OutputTokens int           `json:"-"`
}

// MarshalJSON retains an empty evidence quote for an unassessable observation.
func (p harnessPanel) MarshalJSON() ([]byte, error) {
	if p.Type == "propose_feedback" {
		return json.Marshal(struct {
			Type        string `json:"type"`
			Quote       string `json:"quote"`
			Observation string `json:"observation"`
			NextStep    string `json:"nextStep"`
			RubricID    string `json:"rubricId"`
			Status      string `json:"status"`
		}{p.Type, p.Quote, p.Observation, p.NextStep, p.RubricID, p.Status})
	}
	type plainPanel harnessPanel
	return json.Marshal(plainPanel(p))
}

func safeVisibleText(text string, maximum int) bool {
	if strings.TrimSpace(text) == "" || textUnits(text) > maximum {
		return false
	}
	lower := strings.ToLower(text)
	return !strings.ContainsAny(text, "<>\x00") && !strings.Contains(lower, "http:") && !strings.Contains(lower, "https:") && !strings.Contains(lower, "javascript:") && !strings.Contains(lower, "www.")
}

// Content policy constrains effects and evidence, moderation screens visible content separately.
func validateHarnessReply(result harnessReply, input harnessInput) error {
	if !validReply(result.Text) || !safeVisibleText(result.Text, 400) {
		return errUnsafe
	}
	if result.Animation != "neutral" && result.Animation != "wave" && result.Animation != "think" && result.Animation != "encourage" {
		return errUnsafe
	}
	panel := result.Panel
	if panel == nil {
		return nil
	}
	switch panel.Type {
	case "show_hint":
		if !safeVisibleText(panel.Title, 60) || !safeVisibleText(panel.Text, 200) {
			return errUnsafe
		}
	case "show_choices":
		if !safeVisibleText(panel.Title, 60) || len(panel.Choices) < 1 || len(panel.Choices) > 3 {
			return errUnsafe
		}
		seen := make(map[string]bool)
		for _, choice := range panel.Choices {
			if !knownTopic(choice.ID) || seen[choice.ID] || !safeVisibleText(choice.Label, 60) {
				return errUnsafe
			}
			seen[choice.ID] = true
		}
	case "show_outline":
		if !safeVisibleText(panel.Title, 60) || len(panel.Parts) < 1 || len(panel.Parts) > 3 {
			return errUnsafe
		}
		for _, part := range panel.Parts {
			if !safeVisibleText(part, 100) {
				return errUnsafe
			}
		}
	case "propose_feedback":
		if input.Mode != "practice" || input.Action != "" || panel.RubricID != "idea-and-reason-v1" || !safeVisibleText(panel.Observation, 160) || !safeVisibleText(panel.NextStep, 160) || textUnits(panel.Quote) > 300 {
			return errUnsafe
		}
		if panel.Status != "observed" && panel.Status != "needs_practice" && panel.Status != "not_observed" && panel.Status != "unassessable" {
			return errUnsafe
		}
		if panel.Status == "unassessable" {
			if panel.Quote != "" {
				return errUnsafe
			}
		} else if !safeVisibleText(panel.Quote, 300) || !strings.Contains(input.Speech, panel.Quote) {
			return errUnsafe
		}
	case "propose_next_mission":
		if panel.MissionID != "first-explanation" || !input.Mission.Finished || !safeVisibleText(panel.Title, 60) || !safeVisibleText(panel.Text, 200) {
			return errUnsafe
		}
	case "request_end_session":
		if !safeVisibleText(panel.Text, 200) {
			return errUnsafe
		}
	default:
		return errUnsafe
	}
	encoded, err := json.Marshal(panel)
	if err != nil {
		return errUnsafe
	}
	return validatePanelFields(encoded, panel.Type)
}

func validatePanelFields(data []byte, kind string) error {
	fields, err := uniqueFields(data)
	if err != nil {
		return errUnsafe
	}
	keys := []string{"type"}
	switch kind {
	case "show_hint":
		keys = append(keys, "title", "text")
	case "show_choices":
		keys = append(keys, "title", "choices")
	case "show_outline":
		keys = append(keys, "title", "parts")
	case "propose_feedback":
		keys = append(keys, "quote", "observation", "nextStep", "rubricId", "status")
	case "propose_next_mission":
		keys = append(keys, "missionId", "title", "text")
	case "request_end_session":
		keys = append(keys, "text")
	default:
		return errUnsafe
	}
	if !exactFields(fields, keys...) {
		return errUnsafe
	}
	if kind == "show_choices" {
		var choices []json.RawMessage
		if json.Unmarshal(fields["choices"], &choices) != nil {
			return errUnsafe
		}
		for _, choice := range choices {
			values, err := uniqueFields(choice)
			if err != nil || !exactFields(values, "id", "label") {
				return errUnsafe
			}
		}
	}
	return nil
}

func harnessVisibleText(reply harnessReply) string {
	parts := []string{reply.Text}
	if panel := reply.Panel; panel != nil {
		parts = append(parts, panel.Title, panel.Text, panel.Quote, panel.Observation, panel.NextStep)
		parts = append(parts, panel.Parts...)
		for _, choice := range panel.Choices {
			parts = append(parts, choice.Label)
		}
	}
	return strings.Join(parts, "\n")
}
