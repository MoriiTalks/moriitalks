package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/MoriiTalks/moriitalks/services/api/internal/voice"
)

type healthResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
}

// NewHandler serves the health endpoint without registering the voice lab.
func NewHandler() http.Handler {
	return NewHandlerWithVoice(nil)
}

// NewHandlerWithVoice adds voice routes when a lab server is supplied.
func NewHandlerWithVoice(lab *voice.Server) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", health)
	if lab != nil {
		lab.Register(mux)
	}
	return mux
}

func health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(healthResponse{Status: "ok", Service: "moriitalks-api"})
}
