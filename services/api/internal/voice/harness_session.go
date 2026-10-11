package voice

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/coder/websocket"
)

type harnessHistory struct {
	Speech     string `json:"speech"`
	HeardReply string `json:"heardReply"`
}

type harnessMission struct {
	ID       string `json:"id"`
	Attempts int    `json:"attempts"`
	Finished bool   `json:"finished"`
}

type harnessInput struct {
	Language string           `json:"language"`
	Mode     string           `json:"mode"`
	Topic    string           `json:"topic"`
	Speech   string           `json:"speech"`
	Action   string           `json:"action"`
	History  []harnessHistory `json:"history"`
	Mission  harnessMission   `json:"mission"`
}

type harnessPending struct {
	turnID       int
	generation   int
	id           string
	reply        harnessReply
	historyIndex int
	played       bool
	presented    bool
}

// History contains only accepted words and replies the client confirms it finished presenting.
type harnessState struct {
	generation int
	history    []harnessHistory
	mission    harnessMission
	pending    *harnessPending
	action     string
}

type harnessProvider interface {
	RespondHarness(context.Context, harnessInput) (harnessReply, error)
}

func (s *session) handleHarness(data []byte) bool {
	command, err := parseHarnessCommand(data)
	if err != nil {
		s.mu.Lock()
		if command.TurnID >= 1 && command.TurnID <= maxTurns && command.Generation >= 1 && command.Generation <= 9007199254740991 {
			s.failureHarnessCommandLocked(command, "invalid_message", true)
		} else {
			s.failureLocked(0, "invalid_message", true)
		}
		s.mu.Unlock()
		return true
	}
	if command.Type == "session.close" {
		s.finish("client")
		return false
	}
	if command.Type == "session.start" {
		s.start(clientMessage{Locale: command.Locale, Mode: command.Mode, Topic: command.Topic, AdultConfirmed: command.AdultConfirmed})
		return true
	}
	s.mu.Lock()
	if !s.started {
		s.failureHarnessCommandLocked(command, "invalid_message", true)
		s.mu.Unlock()
		return true
	}
	switch command.Type {
	case "response.played":
		pending := s.harness.pending
		if pending == nil || pending.id != command.ResponseID || pending.turnID != command.TurnID || pending.generation != command.Generation || !pending.presented {
			s.failureHarnessCommandLocked(command, "invalid_message", true)
		} else if !pending.played {
			pending.played = true
			s.harness.history[pending.historyIndex].HeardReply = pending.reply.Text
		}
		s.mu.Unlock()
		return true
	case "panel.dismiss":
		pending := s.harness.pending
		if pending == nil || pending.id != command.ResponseID || pending.generation != command.Generation {
			s.failureHarnessCommandLocked(command, "invalid_message", true)
		} else {
			pending.reply.Panel = nil
		}
		s.mu.Unlock()
		return true
	case "turn.commit", "turn.cancel":
		if command.Generation != s.harness.generation || command.TurnID != s.lastTurn {
			s.failureHarnessCommandLocked(command, "invalid_message", true)
			s.mu.Unlock()
			return true
		}
		s.mu.Unlock()
		if command.Type == "turn.commit" {
			s.commitTurn(command.TurnID)
		} else {
			s.cancelTurn(command.TurnID)
		}
		return true
	}
	if s.active != nil || command.TurnID != s.lastTurn+1 || command.Generation != s.harness.generation+1 || command.TurnID > s.server.limits(s.kind == "live").MaxTurns {
		s.failureHarnessCommandLocked(command, "invalid_message", true)
		s.mu.Unlock()
		return true
	}
	if command.Type == "turn.action" {
		pending := s.harness.pending
		if pending == nil || pending.id != command.ResponseID || !allowedHarnessAction(pending.reply.Panel, command.ActionID) {
			s.failureHarnessCommandLocked(command, "invalid_message", true)
			s.mu.Unlock()
			return true
		}
		command.Text = actionSpeech(command.ActionID, s.options.Locale)
	}
	if command.Type == "turn.start" {
		if s.kind != "live" {
			s.failureHarnessCommandLocked(command, "unavailable", true)
			s.mu.Unlock()
			return true
		}
		s.mu.Unlock()
		s.startTurnAtGeneration(clientMessage{TurnID: command.TurnID, SampleRate: command.SampleRate, Channels: command.Channels, Encoding: command.Encoding}, command.Generation)
		return true
	}
	if s.kind == "live" && !s.reserveHarnessLocked(command) {
		s.mu.Unlock()
		return true
	}
	s.harness.generation = command.Generation
	s.harness.pending = nil
	s.harness.action = command.ActionID
	s.lastTurn = command.TurnID
	if command.Type == "turn.action" {
		if knownTopic(command.ActionID) {
			s.options.Topic = command.ActionID
		}
		if command.ActionID == "finish" {
			s.harness.mission.Finished = true
		}
		if command.ActionID == "start_mission" {
			s.options.Mode = "practice"
			s.harness.mission = harnessMission{ID: "first-explanation"}
		}
	}
	ctx, cancel := context.WithTimeout(s.ctx, 30*time.Second)
	current := &turn{id: command.TurnID, generation: command.Generation, options: s.options, ctx: ctx, cancel: cancel, format: audioFormat{16000}}
	s.active = current
	s.sendLocked(event{Type: "turn.state", TurnID: current.id, State: "thinking"})
	s.mu.Unlock()
	go func() {
		defer current.cancel()
		s.respondHarness(current, strings.TrimSpace(command.Text), time.Now(), 0)
	}()
	return true
}

// A rejected command keeps accepted state intact while its error identifies the attempted turn.
func (s *session) failureHarnessCommandLocked(command harnessCommand, code string, recoverable bool) {
	s.failureGenerationLocked(command.TurnID, pointer(command.Generation), code, recoverable)
}

func (s *session) reserveHarnessLocked(command harnessCommand) bool {
	if s.reservedUSD+turnReserveUSD > s.server.config.MaxSessionUSD+0.000001 {
		s.failureHarnessCommandLocked(command, "limit", false)
		return false
	}
	s.server.mu.Lock()
	if s.server.reservedUSD+turnReserveUSD > s.server.config.MaxLabUSD+0.000001 {
		s.server.mu.Unlock()
		s.failureHarnessCommandLocked(command, "limit", false)
		return false
	}
	s.server.reservedUSD += turnReserveUSD
	s.server.mu.Unlock()
	s.reservedUSD += turnReserveUSD
	return true
}

func allowedHarnessAction(panel *harnessPanel, action string) bool {
	if action == "hint" || action == "outline" || action == "finish" {
		return true
	}
	if panel == nil {
		return false
	}
	switch panel.Type {
	case "show_choices":
		for _, choice := range panel.Choices {
			if action == choice.ID {
				return true
			}
		}
	case "show_hint", "show_outline", "propose_feedback":
		return action == "retry"
	case "propose_next_mission":
		return action == "start_mission"
	case "request_end_session":
		return action == "end_session"
	}
	return false
}

// UI actions become server-owned content, the model cannot execute arbitrary operations.
func actionSpeech(action, locale string) string {
	if locale == "id" {
		switch action {
		case "hobby":
			return "Aku memilih topik hobi."
		case "day":
			return "Aku memilih membahas hari ini."
		case "ideas":
			return "Aku memilih berbagi ide."
		case "hint":
			return "Tolong beri satu petunjuk."
		case "outline":
			return "Tolong tunjukkan kerangka singkat."
		case "retry":
			return "Aku ingin mencoba lagi."
		case "finish":
			return "Aku selesai latihan ini."
		case "start_mission":
			return "Aku ingin latihan ide dan alasan."
		case "end_session":
			return "Aku ingin berhenti sekarang."
		}
	}
	switch action {
	case "hobby":
		return "I choose hobbies."
	case "day":
		return "I choose to discuss today."
	case "ideas":
		return "I choose sharing an idea."
	case "hint":
		return "Please give me one hint."
	case "outline":
		return "Please show a short outline."
	case "retry":
		return "I want to try again."
	case "finish":
		return "I have finished this practice."
	case "start_mission":
		return "I want to practice an idea and a reason."
	case "end_session":
		return "I want to stop now."
	}
	return ""
}

func (s *session) respondHarness(current *turn, speech string, completedAudio time.Time, sttMs int64) {
	s.mu.Lock()
	if s.active != current || current.ctx.Err() != nil {
		s.mu.Unlock()
		return
	}
	if s.options.Mode == "practice" && s.harness.mission.ID == "" {
		s.harness.mission.ID = "first-explanation"
	}
	input := harnessInput{Language: s.options.Locale, Mode: s.options.Mode, Topic: s.options.Topic, Speech: speech, Action: s.harness.action, History: boundedHarnessHistory(s.harness.history), Mission: s.harness.mission}
	options, kind := s.options, s.kind
	s.mu.Unlock()
	coachStart := time.Now()
	var response harnessReply
	var err error
	if kind == "preview" {
		response = scriptedHarnessReply(input)
	} else {
		response, err = s.server.harnessCoach.RespondHarness(current.ctx, input)
	}
	coachMs := time.Since(coachStart).Milliseconds()
	if err == nil {
		err = validateHarnessReply(response, input)
	}
	if err != nil {
		s.providerFailure(current, err)
		return
	}
	panel, err := json.Marshal(response.Panel)
	if err != nil {
		s.providerFailure(current, errProvider)
		return
	}
	s.mu.Lock()
	if s.active != current || current.ctx.Err() != nil {
		s.mu.Unlock()
		return
	}
	if len(s.harness.history) == 6 {
		s.harness.history = s.harness.history[1:]
	}
	s.harness.history = append(s.harness.history, harnessHistory{Speech: speech})
	if options.Mode == "practice" && input.Action == "" && response.Panel != nil && response.Panel.Type == "propose_feedback" && response.Panel.Quote != "" {
		s.harness.mission.Attempts++
	}
	responseID := fmt.Sprintf("%s-%d", s.sessionID, current.generation)
	s.harness.pending = &harnessPending{turnID: current.id, generation: current.generation, id: responseID, reply: response, historyIndex: len(s.harness.history) - 1}
	s.sendLocked(event{Type: "transcript", TurnID: current.id, Text: speech, Final: pointer(true)})
	source := "script"
	if kind == "live" {
		source = "ai"
	}
	s.sendLocked(event{Type: "turn.response", TurnID: current.id, ResponseID: responseID, Text: response.Text, Source: source, Animation: response.Animation, Panel: panel})
	if kind == "preview" {
		s.harness.pending.presented = true
		s.sendLocked(event{Type: "turn.state", TurnID: current.id, State: "ready"})
		s.active = nil
		s.mu.Unlock()
		return
	}
	s.mu.Unlock()
	ttsStart := time.Now()
	audio, err := s.server.providers.Speak(current.ctx, options, response.Text)
	ttsMs := time.Since(ttsStart).Milliseconds()
	if err != nil {
		s.providerFailure(current, err)
		return
	}
	if len(audio) == 0 || len(audio) > maxAudioBytes {
		s.providerFailure(current, errProvider)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active != current || current.ctx.Err() != nil {
		return
	}
	s.sendLocked(event{Type: "turn.state", TurnID: current.id, State: "speaking"})
	s.sendLocked(event{Type: "audio.start", TurnID: current.id, ResponseID: responseID, Format: "mp3"})
	writeCtx, cancel := context.WithTimeout(current.ctx, 3*time.Second)
	err = s.connection.Write(writeCtx, websocket.MessageBinary, audio)
	cancel()
	if err != nil {
		s.failTurnLocked(current, "unavailable")
		return
	}
	s.sendLocked(event{Type: "audio.end", TurnID: current.id, ResponseID: responseID, Bytes: len(audio)})
	s.harness.pending.presented = true
	s.sendLocked(event{Type: "turn.metrics", TurnID: current.id, ResponseID: responseID, STTMs: pointer(sttMs), CoachMs: pointer(coachMs), TTSMs: pointer(ttsMs), TotalMs: pointer(time.Since(completedAudio).Milliseconds()), AudioSeconds: pointer(float64(current.bytes) / float64(current.format.SampleRate*2)), InputTokens: pointer(response.InputTokens), OutputTokens: pointer(response.OutputTokens), TTSCharacters: pointer(utf8.RuneCountInString(response.Text))})
	s.sendLocked(event{Type: "turn.state", TurnID: current.id, State: "ready"})
	s.active = nil
}

// Keep whole recent turns within a small text budget, without inventing a history summary.
func boundedHarnessHistory(history []harnessHistory) []harnessHistory {
	start, units := len(history), 0
	for index := len(history) - 1; index >= 0 && len(history)-index <= 6; index-- {
		current := textUnits(history[index].Speech) + textUnits(history[index].HeardReply)
		if units+current > 3000 {
			break
		}
		units += current
		start = index
	}
	return append([]harnessHistory{}, history[start:]...)
}
