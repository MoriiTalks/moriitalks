package voice

import (
	"bytes"
	"encoding/json"
)

type moderationRequest struct {
	Model string `json:"model"`
	Input string `json:"input"`
}

type moderationResponse struct {
	Results []struct {
		Flagged *bool `json:"flagged"`
	} `json:"results"`
}

type coachInput struct {
	Language string `json:"language"`
	Mode     string `json:"mode"`
	Topic    string `json:"topic"`
	Speech   string `json:"speech"`
}

var textReplySchema = json.RawMessage(`{"type":"object","additionalProperties":false,"required":["text"],"properties":{"text":{"type":"string"}}}`)

type coachFormat struct {
	Type   string          `json:"type"`
	Name   string          `json:"name"`
	Strict bool            `json:"strict"`
	Schema json.RawMessage `json:"schema"`
}

type coachRequest struct {
	Model           string `json:"model"`
	Store           bool   `json:"store"`
	Instructions    string `json:"instructions"`
	Input           string `json:"input"`
	MaxOutputTokens int    `json:"max_output_tokens"`
	Reasoning       struct {
		Effort string `json:"effort"`
	} `json:"reasoning"`
	Text struct {
		Format coachFormat `json:"format"`
	} `json:"text"`
}

type coachContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type coachOutput struct {
	Type         string          `json:"type"`
	Status       string          `json:"status"`
	Content      []coachContent  `json:"content"`
	ToolCalls    json.RawMessage `json:"tool_calls"`
	FunctionCall json.RawMessage `json:"function_call"`
}

type coachUsage struct {
	InputTokens  *int `json:"input_tokens"`
	OutputTokens *int `json:"output_tokens"`
}

type coachResponse struct {
	Status string          `json:"status"`
	Output []coachOutput   `json:"output"`
	Usage  *coachUsage     `json:"usage"`
	Error  json.RawMessage `json:"error"`
}

type coachReply struct {
	Text string `json:"text"`
}

// newCoachRequest keeps session input separate from instructions and requests one text field.
func newCoachRequest(input string, config Config) coachRequest {
	request := coachRequest{
		Model: config.coachModel(), Store: false, Instructions: coachInstructions,
		Input: input, MaxOutputTokens: 600,
	}
	request.Reasoning.Effort = config.coachReasoning()
	request.Text.Format = coachFormat{
		Type: "json_schema", Name: "morii_reply", Strict: true,
		Schema: textReplySchema,
	}
	return request
}

// validateProviderJSON rejects duplicate keys recursively while allowing nullable metadata.
func validateProviderJSON(data []byte, depth int) error {
	data = bytes.TrimSpace(data)
	if len(data) == 0 || depth > 64 {
		return errProvider
	}
	switch data[0] {
	case '{':
		fields, err := objectFields(data)
		if err != nil {
			return errProvider
		}
		for _, value := range fields {
			if err := validateProviderJSON(value, depth+1); err != nil {
				return err
			}
		}
	case '[':
		var values []json.RawMessage
		if json.Unmarshal(data, &values) != nil {
			return errProvider
		}
		for _, value := range values {
			if err := validateProviderJSON(value, depth+1); err != nil {
				return err
			}
		}
	default:
		if !json.Valid(data) {
			return errProvider
		}
	}
	return nil
}
