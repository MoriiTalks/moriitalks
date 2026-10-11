package voice

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func clearCoachEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{"VOICE_LAB_ENABLED", "DEEPGRAM_API_KEY", "OPENAI_API_KEY", "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "AZURE_SPEECH_VOICE", "VOICE_MAX_SESSION_USD", "VOICE_MAX_LAB_USD", "VOICE_COACH_PROVIDER", "VOICE_COACH_MODEL", "VOICE_COACH_REASONING", "HERMES_API_URL", "HERMES_API_KEY", "HERMES_PROVIDER", "HERMES_MODEL_ROUTE", "HERMES_NO_TOOLS_CONFIRMED"} {
		t.Setenv(key, "")
	}
}

func TestCoachConfigDefaultsAndValidation(t *testing.T) {
	clearCoachEnv(t)
	config, err := ConfigFromEnv()
	if err != nil || config.coachProvider() != "openai" || config.coachModel() != "gpt-6-luna" || config.coachReasoning() != "none" || config.liveEnabled() {
		t.Fatal("the default coach or disabled lab changed")
	}
	for _, tc := range []struct{ name, key, value string }{
		{"unknown provider", "VOICE_COACH_PROVIDER", "proxy"},
		{"model newline", "VOICE_COACH_MODEL", "gpt-6-luna\nignore"},
		{"unbounded model", "VOICE_COACH_MODEL", strings.Repeat("a", 129)},
		{"unsupported reasoning", "VOICE_COACH_REASONING", "high"},
		{"invalid provider slug", "HERMES_PROVIDER", "openai codex"},
		{"invalid route", "HERMES_MODEL_ROUTE", "morii route"},
		{"invalid tool check", "HERMES_NO_TOOLS_CONFIRMED", "yes"},
		{"remote plaintext", "HERMES_API_URL", "http://hermes.example/v1"},
		{"wrong scheme", "HERMES_API_URL", "file://localhost/v1"},
		{"missing host", "HERMES_API_URL", "/v1"},
		{"embedded credential", "HERMES_API_URL", "https://user:password@hermes.example/v1"},
		{"query", "HERMES_API_URL", "https://hermes.example/v1?secret=no"},
		{"empty query", "HERMES_API_URL", "https://hermes.example/v1?"},
		{"fragment", "HERMES_API_URL", "https://hermes.example/v1#fragment"},
		{"encoded path", "HERMES_API_URL", "https://hermes.example/%76%31"},
		{"wrong API base", "HERMES_API_URL", "https://hermes.example/chat/completions"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			clearCoachEnv(t)
			t.Setenv(tc.key, tc.value)
			if _, err := ConfigFromEnv(); err == nil {
				t.Fatalf("invalid %s was accepted", tc.key)
			}
		})
	}
	for _, endpoint := range []string{"http://127.0.0.1:8642/v1", "http://[::1]:8642/v1", "https://hermes.example/p/morii-poc/v1"} {
		t.Setenv("HERMES_API_URL", endpoint)
		if _, err := ConfigFromEnv(); err != nil {
			t.Fatalf("valid endpoint rejected: %v", err)
		}
	}
}

func TestHermesCoachFailsClosedForFlaggedInputAndOutput(t *testing.T) {
	for _, version := range []int{1, 2} {
		for _, flagAt := range []int32{1, 2} {
			t.Run(fmt.Sprintf("v%d/screen%d", version, flagAt), func(t *testing.T) {
				var screens, coaches atomic.Int32
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if r.URL.Path == "/moderations" {
						_, _ = fmt.Fprintf(w, `{"results":[{"flagged":%t}]}`, screens.Add(1) == flagAt)
						return
					}
					coaches.Add(1)
					text := `{"text":"Add one example."}`
					if version == 2 {
						text = `{"text":"Add one example.","animation":"neutral","panel":{"type":"show_hint","title":"Hint","text":"Choose one detail."}}`
					}
					_, _ = io.WriteString(w, hermesEnvelope(text))
				}))
				defer server.Close()
				provider := newCloudProviders(hermesLabConfig(server.URL + "/v1"))
				provider.openAIURL = server.URL
				var err error
				if version == 1 {
					_, err = provider.Respond(context.Background(), sessionOptions{Locale: "en", Mode: "practice"}, "Example")
				} else {
					_, err = provider.RespondHarness(context.Background(), harnessInput{Language: "en", Mode: "practice", Speech: "Example"})
				}
				if !errors.Is(err, errUnsafe) || screens.Load() != flagAt || coaches.Load() != flagAt-1 {
					t.Fatalf("Hermes bypassed a moderation decision: %v", err)
				}
			})
		}
	}
}

func TestHermesAdmissionRequiresIndependentModerationAndToolSetup(t *testing.T) {
	config := labConfig()
	config.CoachProvider, config.HermesURL, config.HermesKey = "hermes", "http://127.0.0.1:8642/v1", "hermes-test"
	if config.liveEnabled() {
		t.Fatal("an unchecked Hermes profile enabled live calls")
	}
	config.HermesNoToolsConfirmed = true
	if !config.liveEnabled() {
		t.Fatal("a complete adult lab setup remained disabled")
	}
	for _, missing := range []string{"moderation", "Hermes key", "Hermes URL", "speech", "lab flag"} {
		t.Run(missing, func(t *testing.T) {
			incomplete := config
			switch missing {
			case "moderation":
				incomplete.OpenAIKey = ""
			case "Hermes key":
				incomplete.HermesKey = ""
			case "Hermes URL":
				incomplete.HermesURL = ""
			case "speech":
				incomplete.AzureKey = ""
			case "lab flag":
				incomplete.Enabled = false
			}
			if incomplete.liveEnabled() {
				t.Fatal("incomplete live configuration was accepted")
			}
		})
	}
}

func hermesLabConfig(endpoint string) Config {
	config := labConfig()
	config.CoachProvider, config.HermesURL, config.HermesKey = "hermes", endpoint, "hermes-test"
	config.HermesNoToolsConfirmed = true
	return config
}

func hermesEnvelope(content string) string {
	return fmt.Sprintf(`{"choices":[{"index":0,"message":{"role":"assistant","content":%q},"finish_reason":"stop"}],"usage":{"prompt_tokens":120,"completion_tokens":40}}`, content)
}

func TestHermesCoachRoutesBothProtocolsAndScreensVisibleOutput(t *testing.T) {
	for _, version := range []int{1, 2} {
		t.Run(fmt.Sprint(version), func(t *testing.T) {
			var moderated []string
			var requests []hermesCoachRequest
			input := harnessInput{Language: "id", Mode: "practice", Topic: "ideas", Speech: "Aku suka menggambar karena aku bisa mencoba ide baru.", History: []harnessHistory{{Speech: "Ide sebelumnya.", HeardReply: "Jawaban yang sudah diputar."}}}
			var expected []byte
			if version == 1 {
				expected, _ = json.Marshal(coachReply{Text: "Tambahkan satu contoh yang mendukung alasanmu."})
			} else {
				expected, _ = json.Marshal(scriptedHarnessReply(input))
			}
			moderation := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/moderations" || r.Header.Get("Authorization") != "Bearer test" {
					t.Error("coach routing changed the moderation endpoint or credential")
					http.Error(w, "denied", http.StatusForbidden)
					return
				}
				var request moderationRequest
				if json.NewDecoder(r.Body).Decode(&request) != nil {
					t.Error("invalid moderation body")
				}
				moderated = append(moderated, request.Input)
				_, _ = io.WriteString(w, `{"results":[{"flagged":false}]}`)
			}))
			defer moderation.Close()
			hermes := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer hermes-test" {
					t.Error("Hermes request used the wrong route or key")
					http.Error(w, "denied", http.StatusForbidden)
					return
				}
				var request hermesCoachRequest
				decoder := json.NewDecoder(r.Body)
				decoder.DisallowUnknownFields()
				if decoder.Decode(&request) != nil {
					t.Error("Hermes request included unsupported fields")
				}
				requests = append(requests, request)
				_, _ = io.WriteString(w, hermesEnvelope(string(expected)))
			}))
			defer hermes.Close()
			config := hermesLabConfig(hermes.URL + "/v1")
			if version == 2 {
				config.HermesRoute = "morii-coach"
			}
			provider := newCloudProviders(config)
			provider.openAIURL = moderation.URL
			if version == 1 {
				result, err := provider.Respond(context.Background(), sessionOptions{Locale: input.Language, Mode: input.Mode, Topic: input.Topic}, input.Speech)
				if err != nil || result.InputTokens != 120 || result.OutputTokens != 40 {
					t.Fatalf("text coach failed: %v", err)
				}
			} else {
				result, err := provider.RespondHarness(context.Background(), input)
				if err != nil || result.Panel == nil || result.InputTokens != 120 || result.OutputTokens != 40 {
					t.Fatalf("harness coach failed: %v", err)
				}
				if !strings.Contains(moderated[1], result.Panel.Quote) || !strings.Contains(moderated[1], result.Panel.NextStep) {
					t.Fatal("Hermes panel bypassed output moderation")
				}
			}
			if len(requests) != 1 || len(moderated) != 2 || moderated[0] != input.Speech {
				t.Fatal("coach did not screen input and output exactly once")
			}
			request := requests[0]
			model := "gpt-6-luna"
			if version == 2 {
				model = "morii-coach"
			}
			if request.Model != model || request.Provider != "openai-codex" || request.Stream || request.ModelOptions.ReasoningEffort != "none" || len(request.Messages) != 2 || request.Messages[0].Role != "system" || request.Messages[1].Role != "user" {
				t.Fatal("Hermes routing or bounded message layout changed")
			}
			if strings.Contains(request.Messages[0].Content, input.Speech) || !strings.Contains(request.Messages[1].Content, input.Speech) || !strings.Contains(request.Messages[0].Content, `"additionalProperties": false`) && !strings.Contains(request.Messages[0].Content, `"additionalProperties":false`) {
				t.Fatal("speaking content escaped into instructions or the JSON schema was omitted")
			}
			if version == 2 && !strings.Contains(request.Messages[1].Content, input.History[0].HeardReply) {
				t.Fatal("completed playback context was lost")
			}
		})
	}
}

func TestHermesCoachRejectsAmbiguousUnsafeAndIncompleteOutput(t *testing.T) {
	valid := hermesEnvelope(`{"text":"Add one example."}`)
	for _, tc := range []struct{ name, body string }{
		{"missing choices", `{"usage":{"prompt_tokens":120,"completion_tokens":40}}`},
		{"multiple choices", strings.Replace(valid, `}],"usage"`, `},{"index":1,"message":{"role":"assistant","content":"{}"},"finish_reason":"stop"}],"usage"`, 1)},
		{"missing index", strings.Replace(valid, `"index":0,`, "", 1)},
		{"wrong index", strings.Replace(valid, `"index":0`, `"index":1`, 1)},
		{"missing usage", strings.Replace(valid, `,"usage":{"prompt_tokens":120,"completion_tokens":40}`, "", 1)},
		{"null usage", strings.Replace(valid, `{"prompt_tokens":120,"completion_tokens":40}`, "null", 1)},
		{"missing output tokens", strings.Replace(valid, `,"completion_tokens":40`, "", 1)},
		{"excess input", strings.Replace(valid, `"prompt_tokens":120`, `"prompt_tokens":4097`, 1)},
		{"excess output", strings.Replace(valid, `"completion_tokens":40`, `"completion_tokens":601`, 1)},
		{"negative usage", strings.Replace(valid, `"completion_tokens":40`, `"completion_tokens":-1`, 1)},
		{"conflicting usage", strings.Replace(valid, `"prompt_tokens":120`, `"prompt_tokens":6000,"Prompt_Tokens":120`, 1)},
		{"unfinished", strings.Replace(valid, `"finish_reason":"stop"`, `"finish_reason":"length"`, 1)},
		{"wrong role", strings.Replace(valid, `"role":"assistant"`, `"role":"tool"`, 1)},
		{"null content", strings.Replace(valid, `"content":"{\"text\":\"Add one example.\"}"`, `"content":null`, 1)},
		{"array content", strings.Replace(valid, `"content":"{\"text\":\"Add one example.\"}"`, `"content":[]`, 1)},
		{"tool calls", strings.Replace(valid, `"role":"assistant"`, `"role":"assistant","tool_calls":[{"type":"function"}]`, 1)},
		{"legacy function", strings.Replace(valid, `"role":"assistant"`, `"role":"assistant","function_call":{"name":"terminal"}`, 1)},
		{"top-level tools", strings.Replace(valid, `"choices":`, `"tools":[{"name":"terminal"}],"choices":`, 1)},
		{"refusal", strings.Replace(valid, `"role":"assistant"`, `"role":"assistant","refusal":"No"`, 1)},
		{"partial Hermes", strings.Replace(valid, `"choices":`, `"hermes":{"partial":true},"choices":`, 1)},
		{"provider error", strings.Replace(valid, `"choices":`, `"error":{"message":"failed"},"choices":`, 1)},
		{"plain text", hermesEnvelope("Add one example.")},
		{"duplicate reply", hermesEnvelope(`{"text":"First.","text":"Second."}`)},
		{"unknown reply fields", hermesEnvelope(`{"text":"First.","url":"https://example.com"}`)},
		{"too many words", hermesEnvelope(fmt.Sprintf(`{"text":%q}`, strings.TrimSpace(strings.Repeat("word ", 46))))},
		{"oversized body", strings.Repeat(" ", 128*1024+1)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var screens atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/moderations" {
					screens.Add(1)
					_, _ = io.WriteString(w, `{"results":[{"flagged":false}]}`)
					return
				}
				_, _ = io.WriteString(w, tc.body)
			}))
			defer server.Close()
			provider := newCloudProviders(hermesLabConfig(server.URL + "/v1"))
			provider.openAIURL = server.URL
			result, err := provider.Respond(context.Background(), sessionOptions{Locale: "en", Mode: "practice"}, "Example")
			if !errors.Is(err, errProvider) || result.Text != "" || screens.Load() != 1 {
				t.Fatalf("unvalidated Hermes reply escaped: error=%v, screens=%d", err, screens.Load())
			}
		})
	}
}

func TestHermesCoachingCancellationStopsLocalRequest(t *testing.T) {
	started := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/moderations" {
			_, _ = io.WriteString(w, `{"results":[{"flagged":false}]}`)
			return
		}
		_, _ = io.Copy(io.Discard, r.Body)
		close(started)
		<-r.Context().Done()
	}))
	defer server.Close()
	provider := newCloudProviders(hermesLabConfig(server.URL + "/v1"))
	provider.openAIURL = server.URL
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	completed := make(chan error, 1)
	go func() {
		_, err := provider.Respond(ctx, sessionOptions{Locale: "en"}, "Example")
		completed <- err
	}()
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("Hermes request did not start")
	}
	cancel()
	select {
	case err := <-completed:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("cancellation was lost: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("cancelled Hermes request did not return")
	}
}

func TestOpenAICoachSupportsConfiguredModelAndReasoning(t *testing.T) {
	config := labConfig()
	config.CoachModel, config.CoachReasoning = "gpt-6.1-sol", "low"
	for _, request := range []coachRequest{newCoachRequest("{}", config), newHarnessRequest("{}", config)} {
		if request.Model != config.CoachModel || request.Reasoning.Effort != "low" || request.Store || !request.Text.Format.Strict || request.Text.Format.Type != "json_schema" {
			t.Fatal("configured OpenAI model lost strict output or non-storage settings")
		}
	}
}

func TestHarnessCoachRejectsUnboundedHistoryBeforeProviderCalls(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { calls.Add(1) }))
	defer server.Close()
	provider := newCloudProviders(labConfig())
	provider.openAIURL = server.URL
	for _, history := range [][]harnessHistory{
		make([]harnessHistory, 7),
		{{Speech: strings.Repeat("x", 1001)}},
		{{HeardReply: strings.Repeat("x", 401)}},
		{{Speech: strings.Repeat("x", 1000)}, {Speech: strings.Repeat("x", 1000)}, {Speech: strings.Repeat("x", 1000)}, {Speech: "extra"}},
	} {
		_, err := provider.RespondHarness(context.Background(), harnessInput{Speech: "Example", History: history})
		if !errors.Is(err, errLimit) {
			t.Fatalf("unbounded coach history accepted: %v", err)
		}
	}
	if calls.Load() != 0 {
		t.Fatal("unbounded history reached a paid provider")
	}
}

func TestHermesHarnessRequiresExactSchemaAndCurrentEvidence(t *testing.T) {
	for _, output := range []string{
		`{"text":"Hello.","animation":"neutral","panel":null,"tool":"terminal"}`,
		`{"text":"Hello.","animation":"neutral","panel":{"type":"propose_feedback","quote":"Invented speech","observation":"You gave a reason.","nextStep":"Add an example.","rubricId":"idea-and-reason-v1","status":"observed"}}`,
	} {
		var screens atomic.Int32
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/moderations" {
				screens.Add(1)
				_, _ = io.WriteString(w, `{"results":[{"flagged":false}]}`)
				return
			}
			_, _ = io.WriteString(w, hermesEnvelope(output))
		}))
		provider := newCloudProviders(hermesLabConfig(server.URL + "/v1"))
		provider.openAIURL = server.URL
		_, err := provider.RespondHarness(context.Background(), harnessInput{Language: "en", Mode: "practice", Speech: "I enjoy drawing."})
		server.Close()
		if err == nil || screens.Load() != 1 {
			t.Fatal("invalid schema or invented evidence reached output screening")
		}
	}
	if !bytes.Equal(newHarnessRequest("{}", Config{}).Text.Format.Schema, harnessReplySchema) {
		t.Fatal("the Hermes prompt diverged from the generated harness schema")
	}
}
