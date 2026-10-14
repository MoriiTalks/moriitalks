package voice

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

const publicTestOrigin = "https://morii.ryutamin.tech"

func TestConfiguredOriginsAreBoundedExactSerializedOrigins(t *testing.T) {
	for _, value := range []string{
		"http://morii.ryutamin.tech", "//morii.ryutamin.tech", "null", "*", "https://*.ryutamin.tech",
		"https://morii.ryutamin.tech/", "https://morii.ryutamin.tech/talk", "https://morii.ryutamin.tech?",
		"https://morii.ryutamin.tech?key=value", "https://morii.ryutamin.tech#", "https://morii.ryutamin.tech#fragment",
		"https://user:password@morii.ryutamin.tech", "https://MORII.ryutamin.tech", "HTTPS://morii.ryutamin.tech",
		"https://morii.ryutamin.tech:", "https://morii.ryutamin.tech:443", "https://morii.ryutamin.tech:0",
		"https://morii.ryutamin.tech:65536", "https://morii.ryutamin.tech:0443", "https://morii.ryutamin.tech:abc",
		"https://morii.ryutamin.tech.", "https://-morii.ryutamin.tech", "https://morii_.ryutamin.tech",
		"https://[morii.ryutamin.tech]", "https://[127.0.0.1]", "https://[::1]:",
		publicTestOrigin + ",", "," + publicTestOrigin, publicTestOrigin + ", " + publicTestOrigin,
		strings.Repeat(publicTestOrigin+",", maxAllowedOrigins) + "https://other.example",
		"https://" + strings.Repeat("a", 254),
	} {
		t.Run(value, func(t *testing.T) {
			clearCoachEnv(t)
			t.Setenv("API_ALLOWED_ORIGINS", value)
			if _, err := ConfigFromEnv(); err == nil {
				t.Fatal("invalid origin list was accepted")
			}
		})
	}
	clearCoachEnv(t)
	t.Setenv("API_ALLOWED_ORIGINS", " "+publicTestOrigin+", https://other.example:8443, http://localhost:8081, http://[::1]:8081 ")
	config, err := ConfigFromEnv()
	want := []string{publicTestOrigin, "https://other.example:8443", "http://localhost:8081", "http://[::1]:8081"}
	if err != nil || !reflect.DeepEqual(config.AllowedOrigins, want) {
		t.Fatalf("valid origins were not retained exactly: %+v, %v", config.AllowedOrigins, err)
	}
	t.Setenv("API_ALLOWED_ORIGINS", " ")
	config, err = ConfigFromEnv()
	if err != nil || len(config.AllowedOrigins) != 0 {
		t.Fatalf("empty configuration changed loopback defaults: %+v, %v", config.AllowedOrigins, err)
	}
}

func TestOriginPolicyMatchesSchemeHostAndPortWithoutPrefixes(t *testing.T) {
	server := NewServer(Config{AllowedOrigins: []string{publicTestOrigin, "https://other.example:8443", "http://[::1]:8081"}})
	t.Cleanup(server.Close)
	for _, test := range []struct {
		origin string
		want   bool
	}{
		{publicTestOrigin, true}, {"https://other.example:8443", true}, {"http://[::1]:8081", true},
		{"https://morii.ryutamin.tech.evil.example", false}, {"https://sub.morii.ryutamin.tech", false},
		{"http://morii.ryutamin.tech", false}, {"https://morii.ryutamin.tech:8443", false},
		{"https://morii.ryutamin.tech:443", false}, {"https://other.example", false},
		{"https://other.example:8444", false}, {"http://[::1]:8082", false},
		{"http://localhost:8081", false}, {publicTestOrigin + "/", false}, {"null", false},
	} {
		if got := server.allowedOrigin(test.origin); got != test.want {
			t.Errorf("allowedOrigin(%q) = %t, want %t", test.origin, got, test.want)
		}
	}
	for _, origin := range []string{"http://localhost:8081", "https://localhost", "http://127.0.0.1:19006", "http://[::1]:8081"} {
		if !allowedOrigin(origin) {
			t.Errorf("default loopback origin rejected: %q", origin)
		}
	}
	if allowedOrigin(publicTestOrigin) {
		t.Fatal("public origin enabled without configuration")
	}
}

func TestConfiguredOriginAppliesToAllConfigurationRoutes(t *testing.T) {
	_, server := testServer(t, Config{AllowedOrigins: []string{publicTestOrigin}}, &fakeProviders{})
	for _, route := range []string{"/v1/voice/config", "/v2/voice/config", "/v2/device-talk/config"} {
		for _, origin := range []string{publicTestOrigin, publicTestOrigin + ".evil.example", "http://morii.ryutamin.tech", publicTestOrigin + ":8443", ""} {
			request, err := http.NewRequest(http.MethodGet, server.URL+route, nil)
			if err != nil {
				t.Fatal(err)
			}
			if origin != "" {
				request.Header.Set("Origin", origin)
			}
			response, err := server.Client().Do(request)
			if err != nil {
				t.Fatal(err)
			}
			response.Body.Close()
			want := http.StatusForbidden
			if origin == publicTestOrigin || origin == "" {
				want = http.StatusOK
			}
			if response.StatusCode != want {
				t.Errorf("%s with Origin %q returned %d, want %d", route, origin, response.StatusCode, want)
			}
			if origin == publicTestOrigin && (response.Header.Get("Access-Control-Allow-Origin") != origin || response.Header.Get("Vary") != "Origin") {
				t.Errorf("%s did not return exact origin CORS headers", route)
			}
			if want == http.StatusForbidden && response.Header.Get("Access-Control-Allow-Origin") != "" {
				t.Errorf("%s reflected a denied origin", route)
			}
		}
	}
}

func TestConfiguredOriginWebSocketHandshakeAndReadyWithoutProviders(t *testing.T) {
	config := deviceConfig("http://127.0.0.1:1234")
	config.AllowedOrigins = []string{publicTestOrigin, "https://other.example:8443", "http://[::1]:8081"}
	providers, coach := &fakeProviders{}, &fakeHarnessProvider{}
	lab, server := testServer(t, config, providers)
	lab.deviceCoach, lab.harnessCoach = coach, coach
	for _, route := range []string{"/v1/voice", "/v2/voice", "/v2/device-talk"} {
		for _, origin := range []string{publicTestOrigin, "https://other.example:8443", "http://[::1]:8081", ""} {
			t.Run(route+"/"+origin, func(t *testing.T) {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()
				header := make(http.Header)
				if origin != "" {
					header.Set("Origin", origin)
				}
				connection, _, err := websocket.Dial(ctx, server.URL+route, &websocket.DialOptions{HTTPHeader: header})
				if err != nil {
					t.Fatal(err)
				}
				defer connection.CloseNow()
				version := 2
				if route == "/v1/voice" {
					version = 1
				}
				start := fmt.Sprintf(`{"version":%d,"type":"session.start","locale":"en","mode":"talk","topic":"ideas","adultConfirmed":true}`, version)
				if err := connection.Write(ctx, websocket.MessageText, []byte(start)); err != nil {
					t.Fatal(err)
				}
				_, data, err := connection.Read(ctx)
				if err != nil {
					t.Fatal(err)
				}
				var ready event
				if err := json.Unmarshal(data, &ready); err != nil || ready.Type != "session.ready" {
					t.Fatalf("accepted origin did not reach session readiness: %s, %v", data, err)
				}
			})
		}
	}
	if len(coach.snapshot()) != 0 || providers.listens.Load()+providers.responses.Load()+providers.speech.Load() != 0 {
		t.Fatal("origin handshake checks reached a paid provider")
	}
}

func TestUnconfiguredOriginCannotUseWebSocketSameHostBypass(t *testing.T) {
	_, server := testServer(t, Config{AllowedOrigins: []string{publicTestOrigin}}, &fakeProviders{})
	for _, origin := range []string{server.URL, publicTestOrigin + ".evil.example", "http://morii.ryutamin.tech", publicTestOrigin + ":8443", "null"} {
		for _, route := range []string{"/v1/voice", "/v2/voice", "/v2/device-talk"} {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			connection, response, err := websocket.Dial(ctx, server.URL+route, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{origin}}})
			cancel()
			if connection != nil {
				connection.CloseNow()
			}
			if response != nil {
				response.Body.Close()
			}
			if err == nil || response == nil || response.StatusCode != http.StatusForbidden {
				t.Errorf("%s accepted unconfigured Origin %q", route, origin)
			}
		}
	}
}

func TestDefaultLoopbackWebSocketOriginsRemainAvailable(t *testing.T) {
	_, server := testServer(t, Config{}, &fakeProviders{})
	for _, origin := range []string{"http://localhost", "http://localhost:8081", "http://127.0.0.1:19006", "http://[::1]", "http://[::1]:8081"} {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		connection, _, err := websocket.Dial(ctx, server.URL+"/v2/voice", &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{origin}}})
		if connection != nil {
			connection.CloseNow()
		}
		cancel()
		if err != nil {
			t.Errorf("default loopback origin rejected: %q, %v", origin, err)
		}
	}
}
