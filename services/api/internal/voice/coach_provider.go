package voice

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
)

type coachCompletion struct {
	Text                      string
	InputTokens, OutputTokens int
}

type hermesMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Hermes receives text-only instructions, its toolset must be disabled on the dedicated profile.
type hermesCoachRequest struct {
	Model        string          `json:"model"`
	Provider     string          `json:"provider"`
	Messages     []hermesMessage `json:"messages"`
	Stream       bool            `json:"stream"`
	ModelOptions struct {
		ReasoningEffort string `json:"reasoning_effort"`
	} `json:"model_options"`
}

type hermesCoachResponse struct {
	Choices []struct {
		Index        *int   `json:"index"`
		FinishReason string `json:"finish_reason"`
		Message      struct {
			Role         string          `json:"role"`
			Content      *string         `json:"content"`
			ToolCalls    json.RawMessage `json:"tool_calls"`
			Tools        json.RawMessage `json:"tools"`
			FunctionCall json.RawMessage `json:"function_call"`
			Refusal      json.RawMessage `json:"refusal"`
		} `json:"message"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     *int `json:"prompt_tokens"`
		CompletionTokens *int `json:"completion_tokens"`
	} `json:"usage"`
	Error     json.RawMessage `json:"error"`
	Hermes    json.RawMessage `json:"hermes"`
	ToolCalls json.RawMessage `json:"tool_calls"`
	Tools     json.RawMessage `json:"tools"`
}

// completeCoach normalizes provider envelopes, every reply is still decoded and screened by its caller.
func (p *cloudProviders) completeCoach(ctx context.Context, request coachRequest) (coachCompletion, error) {
	if p.config.validateCoach() != nil || len(request.Input) > 24*1024 {
		return coachCompletion{}, errProvider
	}
	if p.config.coachProvider() == "hermes" {
		return p.completeHermes(ctx, request)
	}
	encoded, err := json.Marshal(request)
	if err != nil {
		return coachCompletion{}, errProvider
	}
	data, err := p.postJSON(ctx, "/responses", encoded)
	if err != nil {
		return coachCompletion{}, err
	}
	var response coachResponse
	if json.Unmarshal(data, &response) != nil || response.Status != "completed" || nonNullProviderField(response.Error) || response.Usage == nil || response.Usage.InputTokens == nil || response.Usage.OutputTokens == nil {
		return coachCompletion{}, errProvider
	}
	result := coachCompletion{InputTokens: *response.Usage.InputTokens, OutputTokens: *response.Usage.OutputTokens}
	count := 0
	for _, output := range response.Output {
		switch output.Type {
		case "reasoning":
			continue
		case "message":
			if count != 0 || len(output.Content) != 1 || output.Content[0].Type != "output_text" || (output.Status != "" && output.Status != "completed") || providerToolPayload(output.ToolCalls) || nonNullProviderField(output.FunctionCall) {
				return coachCompletion{}, errProvider
			}
			result.Text = output.Content[0].Text
			count++
		default:
			// Function calls are never authorized by either coach request.
			return coachCompletion{}, errProvider
		}
	}
	if count != 1 || !validCoachCompletion(result) {
		return coachCompletion{}, errProvider
	}
	return result, nil
}

func (p *cloudProviders) completeHermes(ctx context.Context, request coachRequest) (coachCompletion, error) {
	if !p.config.coachConfigured() {
		return coachCompletion{}, errProvider
	}
	model := request.Model
	if p.config.HermesRoute != "" {
		model = p.config.HermesRoute
	}
	hermes := hermesCoachRequest{Model: model, Provider: p.config.hermesProvider(), Messages: []hermesMessage{
		{Role: "system", Content: request.Instructions + "\nReturn one JSON object matching this schema, without markdown or extra fields:\n" + string(request.Text.Format.Schema)},
		{Role: "user", Content: request.Input},
	}}
	hermes.ModelOptions.ReasoningEffort = request.Reasoning.Effort
	encoded, err := json.Marshal(hermes)
	if err != nil || len(encoded) > 64*1024 {
		return coachCompletion{}, errProvider
	}
	data, err := p.postProviderJSON(ctx, strings.TrimRight(p.config.HermesURL, "/")+"/chat/completions", p.config.HermesKey, encoded)
	if err != nil {
		return coachCompletion{}, err
	}
	var response hermesCoachResponse
	if json.Unmarshal(data, &response) != nil || len(response.Choices) != 1 || response.Usage == nil || response.Usage.PromptTokens == nil || response.Usage.CompletionTokens == nil ||
		nonNullProviderField(response.Error) || nonNullProviderField(response.Hermes) || providerToolPayload(response.ToolCalls) || providerToolPayload(response.Tools) {
		return coachCompletion{}, errProvider
	}
	choice := response.Choices[0]
	if choice.Index == nil || *choice.Index != 0 || choice.FinishReason != "stop" || choice.Message.Role != "assistant" || choice.Message.Content == nil ||
		providerToolPayload(choice.Message.ToolCalls) || providerToolPayload(choice.Message.Tools) || nonNullProviderField(choice.Message.FunctionCall) || nonNullProviderField(choice.Message.Refusal) {
		return coachCompletion{}, errProvider
	}
	result := coachCompletion{Text: *choice.Message.Content, InputTokens: *response.Usage.PromptTokens, OutputTokens: *response.Usage.CompletionTokens}
	if !validCoachCompletion(result) {
		return coachCompletion{}, errProvider
	}
	return result, nil
}

func validCoachCompletion(result coachCompletion) bool {
	return strings.TrimSpace(result.Text) != "" && len(result.Text) <= 24*1024 && result.InputTokens >= 0 && result.InputTokens <= 4096 && result.OutputTokens >= 0 && result.OutputTokens <= 600
}

func nonNullProviderField(value json.RawMessage) bool {
	return len(value) != 0 && !bytes.Equal(bytes.TrimSpace(value), []byte("null"))
}

func providerToolPayload(value json.RawMessage) bool {
	return nonNullProviderField(value) && !bytes.Equal(bytes.TrimSpace(value), []byte("[]"))
}
