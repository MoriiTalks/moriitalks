package voice

import (
	"encoding/xml"
	"errors"
	"io"
	"slices"
	"strings"
	"testing"
)

func TestSpeechMarkupKeepsPrimaryAndSpeakingLocalesSeparate(t *testing.T) {
	for _, voice := range []string{"en-US-AvaMultilingualNeural", "en-US-AndrewMultilingualNeural"} {
		for _, tc := range []struct{ locale, language string }{{"id", "id-ID"}, {"en", "en-US"}} {
			t.Run(voice+"/"+tc.locale, func(t *testing.T) {
				markup, err := speechMarkup(tc.locale, voice, "One clear example.")
				want := `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="` + voice + `"><lang xml:lang="` + tc.language + `">One clear example.</lang></voice></speak>`
				if err != nil || markup != want {
					t.Fatalf("markup=%q, error=%v", markup, err)
				}
			})
		}
	}
}

func TestSpeechMarkupKeepsModelTagsLiteral(t *testing.T) {
	text := `First <break time="9s"/> & <audio src="https://example.com/a.mp3">last</audio>.` + "\t\r\nÉ🙂"
	markup, err := speechMarkup("id", "en-US-AvaMultilingualNeural", text)
	if err != nil {
		t.Fatal(err)
	}
	decoder := xml.NewDecoder(strings.NewReader(markup))
	var elements []string
	var decoded strings.Builder
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		switch token := token.(type) {
		case xml.StartElement:
			elements = append(elements, token.Name.Local)
		case xml.CharData:
			decoded.Write(token)
		}
	}
	if !slices.Equal(elements, []string{"speak", "voice", "lang"}) || decoded.String() != text {
		t.Fatalf("elements=%v, decoded text=%q", elements, decoded.String())
	}
}

func TestSpeechMarkupRejectsInvalidInput(t *testing.T) {
	for _, tc := range []struct {
		name, locale, voice, text string
		want                      error
	}{
		{"unsupported locale", "fr", "en-US-AvaMultilingualNeural", "Example.", errProvider},
		{"locale alias", "id-ID", "en-US-AvaMultilingualNeural", "Example.", errProvider},
		{"missing locale", "", "en-US-AvaMultilingualNeural", "Example.", errProvider},
		{"unsupported voice", "en", "en-US-GuyNeural", "Example.", errProvider},
		{"voice markup", "en", `en-US-AvaMultilingualNeural"><audio src="example"/>`, "Example.", errProvider},
		{"missing voice", "en", "", "Example.", errProvider},
		{"empty text", "en", "en-US-AvaMultilingualNeural", "", errLimit},
		{"word limit", "en", "en-US-AvaMultilingualNeural", strings.Repeat("word ", 46), errLimit},
		{"character limit", "en", "en-US-AvaMultilingualNeural", strings.Repeat("a", 401), errLimit},
		{"UTF16 limit", "en", "en-US-AvaMultilingualNeural", strings.Repeat("🙂", 201), errLimit},
		{"malformed UTF8", "en", "en-US-AvaMultilingualNeural", string([]byte{0xff}), errProvider},
		{"null control", "en", "en-US-AvaMultilingualNeural", "Example\x00", errProvider},
		{"vertical tab", "en", "en-US-AvaMultilingualNeural", "Example\x0b", errProvider},
		{"form feed", "en", "en-US-AvaMultilingualNeural", "Example\x0c", errProvider},
		{"unit separator", "en", "en-US-AvaMultilingualNeural", "Example\x1f", errProvider},
		{"invalid XML FFFE", "en", "en-US-AvaMultilingualNeural", "Example\ufffe", errProvider},
		{"invalid XML FFFF", "en", "en-US-AvaMultilingualNeural", "Example\uffff", errProvider},
	} {
		t.Run(tc.name, func(t *testing.T) {
			markup, err := speechMarkup(tc.locale, tc.voice, tc.text)
			if markup != "" || !errors.Is(err, tc.want) {
				t.Fatalf("markup=%q, error=%v, want=%v", markup, err, tc.want)
			}
		})
	}
}

func TestSpeechMarkupAcceptsExistingReplyLimits(t *testing.T) {
	for _, tc := range []struct{ name, text string }{
		{"45 words", strings.Repeat("word ", 45)},
		{"400 ASCII units", strings.Repeat("a", 400)},
		{"400 UTF16 units", strings.Repeat("🙂", 200)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := speechMarkup("en", "en-US-AvaMultilingualNeural", tc.text); err != nil {
				t.Fatal(err)
			}
		})
	}
}
