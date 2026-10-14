package voice

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"strings"
	"unicode/utf8"
)

const maxDeviceStreamBytes = 256 * 1024

type deviceHermesChunk struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Choices []struct {
		Index        *int            `json:"index"`
		Delta        json.RawMessage `json:"delta"`
		FinishReason *string         `json:"finish_reason"`
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

type deviceHermesDelta struct {
	Role    *string `json:"role"`
	Content *string `json:"content"`
}

// Buffer the complete JSON reply, streaming enables upstream disconnect handling without exposing partial effects.
func (p *cloudProviders) completeDeviceHermesStream(ctx context.Context, request coachRequest) (coachCompletion, error) {
	if err := ctx.Err(); err != nil {
		return coachCompletion{}, err
	}
	if !p.config.deviceTalkEnabled() {
		return coachCompletion{}, errProvider
	}
	model := request.Model
	if p.config.HermesRoute != "" {
		model = p.config.HermesRoute
	}
	hermes := hermesCoachRequest{Model: model, Provider: p.config.hermesProvider(), Stream: true, Messages: []hermesMessage{
		{Role: "system", Content: request.Instructions + "\nReturn one JSON object matching this schema, without markdown or extra fields:\n" + string(request.Text.Format.Schema)},
		{Role: "user", Content: request.Input},
	}}
	hermes.ModelOptions.ReasoningEffort = request.Reasoning.Effort
	encoded, err := json.Marshal(hermes)
	if err != nil || len(encoded) > 64*1024 {
		return coachCompletion{}, errProvider
	}
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(p.config.HermesURL, "/")+"/chat/completions", bytes.NewReader(encoded))
	if err != nil {
		return coachCompletion{}, errProvider
	}
	httpRequest.Header.Set("Authorization", "Bearer "+p.config.HermesKey)
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Accept", "text/event-stream")
	response, err := p.client.Do(httpRequest)
	if err != nil {
		if ctx.Err() != nil {
			return coachCompletion{}, ctx.Err()
		}
		return coachCompletion{}, errProvider
	}
	defer response.Body.Close()
	contentType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if response.StatusCode != http.StatusOK || err != nil || contentType != "text/event-stream" {
		return coachCompletion{}, errProvider
	}
	return readDeviceHermesStream(ctx, response.Body)
}

type deviceStreamState struct {
	id       string
	roleSeen bool
	finished bool
	chunks   int
	result   coachCompletion
}

func readDeviceHermesStream(ctx context.Context, body io.Reader) (coachCompletion, error) {
	limited := &io.LimitedReader{R: body, N: maxDeviceStreamBytes + 1}
	scanner := bufio.NewScanner(limited)
	scanner.Buffer(make([]byte, 1024), 32*1024)
	state := deviceStreamState{}
	var data strings.Builder
	for scanner.Scan() {
		if err := ctx.Err(); err != nil {
			return coachCompletion{}, err
		}
		if limited.N <= 0 {
			return coachCompletion{}, errLimit
		}
		line := scanner.Text()
		if line == "" {
			if data.Len() != 0 {
				done, err := state.accept([]byte(strings.TrimSuffix(data.String(), "\n")))
				data.Reset()
				if err != nil {
					return coachCompletion{}, err
				}
				if done {
					return state.result, nil
				}
			}
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		field, value, found := strings.Cut(line, ":")
		if !found {
			return coachCompletion{}, errProvider
		}
		value = strings.TrimPrefix(value, " ")
		switch field {
		case "data":
			if data.Len()+len(value)+1 > 32*1024 {
				return coachCompletion{}, errLimit
			}
			data.WriteString(value)
			data.WriteByte('\n')
		case "event":
			if value != "message" {
				return coachCompletion{}, errProvider
			}
		default:
			return coachCompletion{}, errProvider
		}
	}
	if ctx.Err() != nil {
		return coachCompletion{}, ctx.Err()
	}
	if limited.N <= 0 {
		return coachCompletion{}, errLimit
	}
	return coachCompletion{}, errProvider
}

func (s *deviceStreamState) accept(data []byte) (bool, error) {
	if bytes.Equal(data, []byte("[DONE]")) {
		if !s.finished || !validCoachCompletion(s.result) {
			return false, errProvider
		}
		return true, nil
	}
	s.chunks++
	if s.finished || s.chunks > 1024 || !utf8.Valid(data) || validateProviderJSON(data, 0) != nil {
		return false, errProvider
	}
	var chunk deviceHermesChunk
	if json.Unmarshal(data, &chunk) != nil || chunk.ID == "" || len(chunk.ID) > 128 || chunk.Object != "chat.completion.chunk" || len(chunk.Choices) != 1 || nonNullProviderField(chunk.Error) || nonNullProviderField(chunk.Hermes) || providerToolPayload(chunk.Tools) || providerToolPayload(chunk.ToolCalls) {
		return false, errProvider
	}
	if s.id == "" {
		s.id = chunk.ID
	} else if s.id != chunk.ID {
		return false, errProvider
	}
	choice := chunk.Choices[0]
	if choice.Index == nil || *choice.Index != 0 {
		return false, errProvider
	}
	fields, err := uniqueFields(choice.Delta)
	if err != nil {
		return false, errProvider
	}
	for field := range fields {
		if field != "role" && field != "content" {
			return false, errProvider
		}
	}
	var delta deviceHermesDelta
	if json.Unmarshal(choice.Delta, &delta) != nil {
		return false, errProvider
	}
	if delta.Role != nil {
		if s.roleSeen || *delta.Role != "assistant" {
			return false, errProvider
		}
		s.roleSeen = true
	}
	if delta.Content != nil {
		if !s.roleSeen || len(s.result.Text)+len(*delta.Content) > 24*1024 {
			return false, errProvider
		}
		s.result.Text += *delta.Content
	}
	if choice.FinishReason == nil {
		if chunk.Usage != nil {
			return false, errProvider
		}
		return false, nil
	}
	if *choice.FinishReason != "stop" || len(fields) != 0 || chunk.Usage == nil || chunk.Usage.PromptTokens == nil || chunk.Usage.CompletionTokens == nil {
		return false, errProvider
	}
	s.result.InputTokens, s.result.OutputTokens = *chunk.Usage.PromptTokens, *chunk.Usage.CompletionTokens
	if !validCoachCompletion(s.result) {
		return false, errProvider
	}
	s.finished = true
	return false, nil
}
