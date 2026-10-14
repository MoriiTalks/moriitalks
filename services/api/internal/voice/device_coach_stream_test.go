package voice

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func deviceStreamChunk(delta, finish, usage string) string {
	return fmt.Sprintf("data: {\"id\":\"chat-test\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":%s,\"finish_reason\":%s}]%s}\n\n", delta, finish, usage)
}

func deviceStreamReply(text string) string {
	encoded, _ := json.Marshal(struct {
		Content string `json:"content"`
	}{text})
	return deviceStreamChunk(`{"role":"assistant"}`, "null", "") +
		": keepalive\n\n" + deviceStreamChunk(string(encoded), "null", "") +
		deviceStreamChunk("{}", `"stop"`, `,"usage":{"prompt_tokens":30,"completion_tokens":20}`) + "data: [DONE]\n\n"
}

func writeDeviceHermesStreamReply(w http.ResponseWriter, text string) {
	w.Header().Set("Content-Type", "text/event-stream")
	_, _ = io.WriteString(w, deviceStreamReply(text))
}

func TestDeviceHermesStreamRequiresCompleteBoundedReply(t *testing.T) {
	text := `{"text":"Halo. Apa yang ingin kamu jelaskan?","animation":"wave","panel":null}`
	result, err := readDeviceHermesStream(context.Background(), strings.NewReader(deviceStreamReply(text)))
	if err != nil || result.Text != text || result.InputTokens != 30 || result.OutputTokens != 20 {
		t.Fatalf("valid device stream failed: %+v, %v", result, err)
	}
	for _, test := range []struct {
		name   string
		stream string
	}{
		{"missing_done", strings.TrimSuffix(deviceStreamReply(text), "data: [DONE]\n\n")},
		{"premature_done", "data: [DONE]\n\n"},
		{"truncated_finish", strings.Replace(deviceStreamReply(text), `"stop"`, `"length"`, 1)},
		{"missing_usage", strings.Replace(deviceStreamReply(text), `,"usage":{"prompt_tokens":30,"completion_tokens":20}`, "", 1)},
		{"excess_usage", strings.Replace(deviceStreamReply(text), `"completion_tokens":20`, `"completion_tokens":601`, 1)},
		{"negative_usage", strings.Replace(deviceStreamReply(text), `"completion_tokens":20`, `"completion_tokens":-1`, 1)},
		{"wrong_index", strings.Replace(deviceStreamReply(text), `"index":0`, `"index":1`, 1)},
		{"changed_identity", strings.Replace(deviceStreamReply(text), `"id":"chat-test"`, `"id":"another"`, 1)},
		{"malformed_json", "data: {bad}\n\n"},
		{"invalid_utf8", deviceStreamChunk(`{"role":"assistant"}`, "null", "") + deviceStreamChunk("{\"content\":\""+string([]byte{0xff})+"\"}", "null", "")},
		{"duplicate_index", strings.Replace(deviceStreamReply(text), `"index":0`, `"index":0,"index":1`, 1)},
		{"tools_delta", deviceStreamChunk(`{"tool_calls":[]}`, "null", "")},
		{"function_delta", deviceStreamChunk(`{"function_call":{"name":"terminal"}}`, "null", "")},
		{"reasoning_delta", deviceStreamChunk(`{"reasoning_content":"private"}`, "null", "")},
		{"wrong_content_type", deviceStreamChunk(`{"content":2}`, "null", "")},
		{"content_before_role", deviceStreamChunk(`{"content":"hello"}`, "null", "")},
		{"named_tool_event", "event: hermes.tool.progress\ndata: {}\n\n"},
		{"named_status_event", "event: hermes.status\ndata: {}\n\n"},
		{"named_approval_event", "event: approval.request\ndata: {}\n\n"},
		{"oversized_event", "data: " + strings.Repeat("x", 33*1024) + "\n\n"},
		{"oversized_raw_stream", strings.Repeat(": keepalive\n\n", maxDeviceStreamBytes/13+1)},
	} {
		t.Run(test.name, func(t *testing.T) {
			result, err := readDeviceHermesStream(context.Background(), strings.NewReader(test.stream))
			if err == nil || result.Text != "" || result.InputTokens != 0 || result.OutputTokens != 0 {
				t.Fatalf("invalid stream exposed partial completion: %+v, %v", result, err)
			}
		})
	}
}

func TestDeviceHermesStreamRejectsTransportAndContentTypeFailures(t *testing.T) {
	for _, test := range []struct {
		name        string
		status      int
		contentType string
	}{
		{"http_error", http.StatusServiceUnavailable, "text/event-stream"},
		{"json_response", http.StatusOK, "application/json"},
		{"missing_content_type", http.StatusOK, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			hermes := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", test.contentType)
				w.WriteHeader(test.status)
				_, _ = io.WriteString(w, deviceStreamReply("{}"))
			}))
			defer hermes.Close()
			coach := newDeviceHarnessCoach(deviceConfig(hermes.URL))
			if _, err := coach.RespondHarness(context.Background(), harnessInput{Language: "id", Mode: "talk", Topic: "ideas", Speech: "Halo Morii."}); err == nil {
				t.Fatal("invalid streaming transport was accepted")
			}
		})
	}
}

func TestDeviceTalkCancellationDuringSSEDiscardsPartialReply(t *testing.T) {
	partial := make(chan struct{})
	disconnected := make(chan struct{})
	secondInput := make(chan harnessInput, 1)
	hermes := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request hermesCoachRequest
		if json.NewDecoder(r.Body).Decode(&request) != nil || !request.Stream {
			t.Error("device coach did not request streaming")
			return
		}
		var input harnessInput
		if len(request.Messages) != 2 || json.Unmarshal([]byte(request.Messages[1].Content), &input) != nil {
			t.Error("invalid device harness input")
			return
		}
		if input.Speech == "Halo Morii." {
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = io.WriteString(w, deviceStreamChunk(`{"role":"assistant"}`, "null", "")+deviceStreamChunk(`{"content":"{\"text\":\"Tidak boleh tampil"}`, "null", ""))
			controller := http.NewResponseController(w)
			if err := controller.Flush(); err != nil {
				t.Error(err)
				return
			}
			close(partial)
			<-r.Context().Done()
			close(disconnected)
			return
		}
		secondInput <- input
		writeDeviceHermesStreamReply(w, `{"text":"Mari jelaskan satu ide.","animation":"neutral","panel":null}`)
	}))
	defer hermes.Close()
	_, server := testServer(t, deviceConfig(hermes.URL), &fakeProviders{})
	client := connectDeviceClient(t, server, true)
	client.until("session.ready")
	client.send(`{"type":"turn.text","version":2,"turnId":1,"generation":1,"text":"Halo Morii."}`)
	client.until("turn.state")
	select {
	case <-partial:
	case <-time.After(2 * time.Second):
		t.Fatal("partial SSE reply did not arrive")
	}
	client.send(`{"type":"turn.cancel","version":2,"turnId":1,"generation":1}`)
	if value := client.next(); value.Type != "turn.cancelled" || value.TurnID != 1 {
		t.Fatalf("partial SSE output reached the client before cancellation: %+v", value)
	}
	select {
	case <-disconnected:
	case <-time.After(2 * time.Second):
		t.Fatal("cancellation did not close the upstream SSE request")
	}
	response := client.text(2, "Saya ingin menjelaskan tanaman.")
	input := <-secondInput
	if response.TurnID != 2 || strings.Contains(response.Text, "Tidak boleh") || len(input.History) != 0 {
		t.Fatal("cancelled partial JSON entered the response or history")
	}
}

func TestDeviceHermesStreamPreservesDeadlineDuringBodyRead(t *testing.T) {
	started := make(chan struct{})
	hermes := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, deviceStreamChunk(`{"role":"assistant"}`, "null", ""))
		if err := http.NewResponseController(w).Flush(); err != nil {
			t.Error(err)
			return
		}
		close(started)
		<-r.Context().Done()
	}))
	defer hermes.Close()
	coach := newDeviceHarnessCoach(deviceConfig(hermes.URL))
	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel()
	_, err := coach.RespondHarness(ctx, harnessInput{Language: "id", Mode: "talk", Topic: "ideas", Speech: "Halo Morii."})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("body read lost the deadline: %v", err)
	}
	select {
	case <-started:
	default:
		t.Fatal("deadline test did not reach the streaming body")
	}
}
