package voice

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/coder/websocket"
)

// Server manages preview and live sessions for the adult engineering voice lab.
type Server struct {
	config         Config
	providers      providers
	slots          chan struct{}
	mu             sync.Mutex
	connections    map[*websocket.Conn]context.CancelFunc
	closed         bool
	reservedUSD    float64
	captureTimeout time.Duration
}

// NewServer creates a lab server with process-local admission accounting.
func NewServer(config Config) *Server {
	return &Server{config: config, providers: newCloudProviders(config), slots: make(chan struct{}, 5), connections: make(map[*websocket.Conn]context.CancelFunc), captureTimeout: maxTurnSeconds * time.Second}
}

// Register adds the voice configuration and WebSocket routes.
func (s *Server) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/voice/config", s.configuration)
	mux.HandleFunc("GET /v1/voice", s.connect)
}

// Loopback Origin checks constrain browser callers, they do not authenticate users.
func allowedOrigin(origin string) bool {
	u, err := url.Parse(origin)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") &&
		(u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1") &&
		u.User == nil && u.Path == "" && u.RawQuery == "" && u.Fragment == ""
}

func (s *Server) configuration(w http.ResponseWriter, r *http.Request) {
	if origin := r.Header.Get("Origin"); origin != "" {
		if !allowedOrigin(origin) {
			http.Error(w, "Origin is not allowed", http.StatusForbidden)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(configurationResponse{1, s.config.liveEnabled(), s.limits(s.config.liveEnabled())})
}

func (s *Server) connect(w http.ResponseWriter, r *http.Request) {
	if origin := r.Header.Get("Origin"); origin != "" && !allowedOrigin(origin) {
		http.Error(w, "Origin is not allowed", http.StatusForbidden)
		return
	}
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		http.Error(w, "Voice lab is busy", http.StatusTooManyRequests)
		return
	}
	connection, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: []string{"localhost:*", "127.0.0.1:*", `\[::1\]:*`}, CompressionMode: websocket.CompressionDisabled})
	if err != nil {
		return
	}
	defer connection.CloseNow()
	connection.SetReadLimit(64 * 1024)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.connections[connection] = cancel
	s.mu.Unlock()
	defer func() { s.mu.Lock(); delete(s.connections, connection); s.mu.Unlock() }()
	session := &session{server: s, connection: connection, ctx: ctx, cancel: cancel}
	expiry := time.AfterFunc(maxSessionSeconds*time.Second, session.expire)
	defer expiry.Stop()
	defer session.stopTurn()
	session.run()
}

// Close cancels active sessions and closes their WebSocket connections.
func (s *Server) Close() {
	s.mu.Lock()
	s.closed = true
	connections := make([]*websocket.Conn, 0, len(s.connections))
	for connection, cancel := range s.connections {
		cancel()
		connections = append(connections, connection)
	}
	s.mu.Unlock()
	for _, connection := range connections {
		_ = connection.CloseNow()
	}
}

type turn struct {
	id           int
	format       audioFormat
	ctx          context.Context
	cancel       context.CancelFunc
	audio        chan []byte
	committed    bool
	bytes        int
	started      time.Time
	captureTimer *time.Timer
}

// session serializes state changes and outgoing event order with mu.
type session struct {
	server      *Server
	connection  *websocket.Conn
	ctx         context.Context
	cancel      context.CancelFunc
	mu          sync.Mutex
	sequence    int
	started     bool
	sessionID   string
	kind        string
	options     sessionOptions
	lastTurn    int
	reservedUSD float64
	active      *turn
	closed      bool
}

func (s *session) run() {
	idle := time.AfterFunc(45*time.Second, s.expire)
	defer idle.Stop()
	for {
		kind, data, err := s.connection.Read(s.ctx)
		if err != nil {
			return
		}
		if s.ctx.Err() != nil {
			return
		}
		idle.Reset(45 * time.Second)
		if kind == websocket.MessageBinary {
			s.receiveAudio(data)
			continue
		}
		message, err := parseMessage(data)
		if err != nil {
			s.failure(0, "invalid_message", true)
			continue
		}
		if message.Type == "session.close" {
			s.finish("client")
			return
		}
		if message.Type == "session.start" {
			s.start(message)
			continue
		}
		s.mu.Lock()
		started := s.started
		s.mu.Unlock()
		if !started {
			s.failure(message.TurnID, "invalid_message", true)
			continue
		}
		switch message.Type {
		case "demo.turn":
			s.demo(message)
		case "turn.start":
			s.startTurn(message)
		case "turn.commit":
			s.commitTurn(message.TurnID)
		case "turn.cancel":
			s.cancelTurn(message.TurnID)
		}
	}
}

func (s *session) start(message clientMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.started {
		var id [16]byte
		if _, err := rand.Read(id[:]); err != nil {
			s.failureLocked(0, "unavailable", false)
			return
		}
		s.sessionID = hex.EncodeToString(id[:])
		s.options = sessionOptions{message.Locale, message.Mode, message.Topic}
		s.kind = "preview"
		// Adult confirmation is a lab self-declaration, not age verification.
		if message.AdultConfirmed && s.server.config.liveEnabled() {
			s.kind = "live"
		}
		s.started = true
	} else if s.options != (sessionOptions{message.Locale, message.Mode, message.Topic}) {
		s.failureLocked(0, "invalid_message", false)
		return
	}
	value := s.server.limits(s.kind == "live")
	s.sendLocked(event{Type: "session.ready", SessionID: s.sessionID, Kind: s.kind, Limits: &value})
}

// demo emits fixed examples without contacting providers.
func (s *session) demo(message clientMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.kind != "preview" {
		s.failureLocked(message.TurnID, "invalid_message", true)
		return
	}
	if message.TurnID <= s.lastTurn {
		return
	}
	if message.TurnID != s.lastTurn+1 {
		s.failureLocked(message.TurnID, "invalid_message", true)
		return
	}
	s.lastTurn = message.TurnID
	text, feedback := example(s.options.Locale, message.Example)
	s.sendLocked(event{Type: "turn.state", TurnID: message.TurnID, State: "thinking"})
	s.sendLocked(event{Type: "transcript", TurnID: message.TurnID, Text: text, Final: pointer(true)})
	s.sendLocked(event{Type: "turn.response", TurnID: message.TurnID, Text: feedback, Source: "script"})
	s.sendLocked(event{Type: "turn.state", TurnID: message.TurnID, State: "ready"})
}

func example(locale, choice string) (string, string) {
	if locale == "id" {
		if choice == "reason" {
			return "Aku suka menggambar karena bisa membuat cerita. Contohnya, aku menggambar petualangan seekor kucing.", "Kamu menyebut alasan dan contoh. Coba jelaskan bagaimana contoh itu mendukung alasanmu."
		}
		return "Aku suka menggambar.", "Pilihanmu sudah jelas. Tambahkan satu alasan. Coba mulai dengan: Aku suka menggambar karena…"
	}
	if choice == "reason" {
		return "I enjoy drawing because I can make stories. For example, I drew a cat on an adventure.", "You gave a reason and an example. Try explaining how the example supports your reason."
	}
	return "I like drawing.", "Your choice is clear. Add one reason. Try starting with: I like drawing because…"
}

func (s *session) startTurn(message clientMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.kind != "live" {
		s.failureLocked(message.TurnID, "unavailable", true)
		return
	}
	if message.TurnID <= s.lastTurn {
		return
	}
	if s.active != nil || message.TurnID != s.lastTurn+1 {
		s.failureLocked(message.TurnID, "invalid_message", true)
		return
	}
	// Reserve admission capacity before a provider can incur any charge.
	// Reservations are never refunded and do not guarantee a provider invoice cap.
	if s.reservedUSD+turnReserveUSD > s.server.config.MaxSessionUSD+0.000001 {
		s.failureLocked(message.TurnID, "limit", false)
		return
	}
	s.server.mu.Lock()
	if s.server.reservedUSD+turnReserveUSD > s.server.config.MaxLabUSD+0.000001 {
		s.server.mu.Unlock()
		s.failureLocked(message.TurnID, "limit", false)
		return
	}
	s.server.reservedUSD += turnReserveUSD
	s.server.mu.Unlock()
	s.reservedUSD += turnReserveUSD
	s.lastTurn = message.TurnID
	ctx, cancel := context.WithTimeout(s.ctx, (maxTurnSeconds+30)*time.Second)
	current := &turn{id: message.TurnID, format: audioFormat{message.SampleRate}, ctx: ctx, cancel: cancel, audio: make(chan []byte, 16), started: time.Now(), captureTimer: time.NewTimer(s.server.captureTimeout)}
	s.active = current
	s.sendLocked(event{Type: "turn.state", TurnID: current.id, State: "listening"})
	go s.process(current)
}

func (s *session) receiveAudio(data []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current := s.active
	if s.kind != "live" || current == nil || current.committed {
		s.failureLocked(0, "invalid_message", true)
		return
	}
	if len(data) == 0 || len(data)%2 != 0 {
		s.failTurnLocked(current, "invalid_message")
		return
	}
	if current.bytes+len(data) > current.format.SampleRate*2*maxTurnSeconds || time.Since(current.started) > maxTurnSeconds*time.Second {
		s.failTurnLocked(current, "limit")
		return
	}
	select {
	case current.audio <- data:
		current.bytes += len(data)
	default:
		s.failTurnLocked(current, "limit")
	}
}

func (s *session) commitTurn(id int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active == nil {
		if id > s.lastTurn {
			s.failureLocked(id, "invalid_message", true)
		}
		return
	}
	current := s.active
	if current.id != id {
		s.failureLocked(id, "invalid_message", true)
		return
	}
	if current.committed {
		return
	}
	if current.bytes == 0 {
		s.failTurnLocked(current, "invalid_message")
		return
	}
	current.committed = true
	current.captureTimer.Stop()
	// Closing the queue lets the worker drain accepted audio before finalizing STT.
	close(current.audio)
	s.sendLocked(event{Type: "turn.state", TurnID: id, State: "thinking"})
}

func (s *session) cancelTurn(id int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if id > s.lastTurn {
		s.failureLocked(id, "invalid_message", true)
		return
	}
	if s.active != nil && s.active.id == id {
		s.active.cancel()
		s.active = nil
	}
	s.sendLocked(event{Type: "turn.cancelled", TurnID: id})
}

func (s *session) stopTurn() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active != nil {
		s.active.cancel()
		s.active = nil
	}
	s.closed = true
	// The session cancellation also stops any provider call still in flight.
	s.cancel()
}

func (s *session) expire() {
	s.finish("timeout")
}

func (s *session) finish(reason string) {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	if s.active != nil {
		s.active.cancel()
		s.active = nil
	}
	s.sendLocked(event{Type: "session.closed", Reason: reason})
	s.cancel()
	s.mu.Unlock()
	_ = s.connection.CloseNow()
}

func (s *session) failTurnLocked(current *turn, code string) {
	current.cancel()
	if s.active == current {
		s.active = nil
	}
	s.failureLocked(current.id, code, true)
}

func (s *session) process(current *turn) {
	defer current.cancel()
	defer current.captureTimer.Stop()
	stream, err := s.server.providers.Listen(current.ctx, s.options, current.format, func(text string) {
		s.sendForTurn(current, event{Type: "transcript", TurnID: current.id, Text: text, Final: pointer(false)})
	})
	if err != nil {
		s.providerFailure(current, err)
		return
	}
	defer stream.Close()
	forwardedBytes := 0
	for {
		select {
		case <-current.ctx.Done():
			s.providerFailure(current, current.ctx.Err())
			return
		case <-current.captureTimer.C:
			s.mu.Lock()
			committed := current.committed
			s.mu.Unlock()
			if committed {
				continue
			}
			s.providerFailure(current, errLimit)
			return
		case audio, open := <-current.audio:
			if !open {
				goto committed
			}
			if err := stream.Send(current.ctx, audio); err != nil {
				s.providerFailure(current, err)
				return
			}
			forwardedBytes += len(audio)
			s.sendForTurn(current, event{Type: "turn.audio.accepted", TurnID: current.id, Bytes: forwardedBytes})
		}
	}
committed:
	completedAudio := time.Now()
	text, err := stream.Finish(current.ctx)
	sttMs := time.Since(completedAudio).Milliseconds()
	if err != nil {
		s.providerFailure(current, err)
		return
	}
	if text == "" {
		s.providerFailure(current, errProvider)
		return
	}
	coachStart := time.Now()
	response, err := s.server.providers.Respond(current.ctx, s.options, text)
	coachMs := time.Since(coachStart).Milliseconds()
	if err != nil {
		s.providerFailure(current, err)
		return
	}
	s.sendForTurn(current, event{Type: "transcript", TurnID: current.id, Text: text, Final: pointer(true)})
	s.sendForTurn(current, event{Type: "turn.response", TurnID: current.id, Text: response.Text, Source: "ai"})
	ttsStart := time.Now()
	audio, err := s.server.providers.Speak(current.ctx, s.options, response.Text)
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
	s.sendLocked(event{Type: "audio.start", TurnID: current.id, Format: "mp3"})
	writeCtx, cancel := context.WithTimeout(current.ctx, 3*time.Second)
	err = s.connection.Write(writeCtx, websocket.MessageBinary, audio)
	cancel()
	if err != nil {
		s.failTurnLocked(current, "unavailable")
		return
	}
	s.sendLocked(event{Type: "audio.end", TurnID: current.id, Bytes: len(audio)})
	s.sendLocked(event{
		Type: "turn.metrics", TurnID: current.id,
		STTMs: pointer(sttMs), CoachMs: pointer(coachMs), TTSMs: pointer(ttsMs), TotalMs: pointer(time.Since(completedAudio).Milliseconds()),
		AudioSeconds: pointer(float64(current.bytes) / float64(current.format.SampleRate*2)),
		InputTokens:  pointer(response.InputTokens), OutputTokens: pointer(response.OutputTokens), TTSCharacters: pointer(utf8.RuneCountInString(response.Text)),
	})
	s.sendLocked(event{Type: "turn.state", TurnID: current.id, State: "ready"})
	s.active = nil
}

func (s *session) providerFailure(current *turn, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active != current || s.ctx.Err() != nil {
		return
	}
	code := "provider"
	if errors.Is(err, errUnsafe) {
		code = "unsafe"
	}
	if errors.Is(err, errLimit) {
		code = "limit"
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(current.ctx.Err(), context.DeadlineExceeded) {
		code = "timeout"
	}
	s.failTurnLocked(current, code)
}

// sendForTurn suppresses delayed provider output after a turn is cancelled or replaced.
func (s *session) sendForTurn(current *turn, value event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active == current && current.ctx.Err() == nil {
		s.sendLocked(value)
	}
}

func (s *session) failure(id int, code string, recoverable bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.failureLocked(id, code, recoverable)
}

func (s *session) failureLocked(id int, code string, recoverable bool) {
	message := "This turn could not be completed. Please try again."
	if s.options.Locale == "id" {
		message = "Giliran ini belum bisa diselesaikan. Silakan coba lagi."
	}
	s.sendLocked(event{Type: "error", TurnID: id, Code: code, Message: message, Recoverable: pointer(recoverable)})
}

// sendLocked requires mu so sequence numbers follow the WebSocket write order.
func (s *session) sendLocked(value event) {
	if s.closed && value.Type != "session.closed" {
		return
	}
	s.sequence++
	value.Version, value.Sequence = 1, s.sequence
	data, err := json.Marshal(value)
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if s.connection.Write(ctx, websocket.MessageText, data) != nil {
		s.cancel()
	}
}
