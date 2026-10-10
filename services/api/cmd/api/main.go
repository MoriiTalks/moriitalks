package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/MoriiTalks/moriitalks/services/api/internal/httpapi"
	"github.com/MoriiTalks/moriitalks/services/api/internal/voice"
)

func main() {
	if err := run(); err != nil {
		slog.Error("API stopped", "error", err)
		os.Exit(1)
	}
}

// run owns the HTTP server and voice lab lifecycle.
func run() error {
	addr := os.Getenv("API_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8080"
	}
	voiceConfig, err := voice.ConfigFromEnv()
	if err != nil {
		return err
	}
	lab := voice.NewServer(voiceConfig)
	defer lab.Close()

	server := &http.Server{
		Addr:              addr,
		Handler:           httpapi.NewHandlerWithVoice(lab),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serverErr := make(chan error, 1)
	go func() {
		slog.Info("API listening", "address", addr)
		serverErr <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErr:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		stop()
		slog.Info("API shutting down")
		// WebSocket connections need explicit closure before HTTP shutdown.
		lab.Close()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			_ = server.Close()
			return err
		}
		return nil
	}
}
