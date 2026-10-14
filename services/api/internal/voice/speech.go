package voice

import (
	"bytes"
	"encoding/xml"
	"unicode/utf8"
)

// speechMarkup keeps voice settings server-owned and model text literal, using the voice's primary locale at the root.
func speechMarkup(locale, voice, text string) (string, error) {
	if voice != "en-US-AvaMultilingualNeural" && voice != "en-US-AndrewMultilingualNeural" {
		return "", errProvider
	}
	var language string
	switch locale {
	case "id":
		language = "id-ID"
	case "en":
		language = "en-US"
	default:
		return "", errProvider
	}
	if !validReply(text) {
		return "", errLimit
	}
	if !utf8.ValidString(text) {
		return "", errProvider
	}
	for _, character := range text {
		// XML 1.0 permits these whitespace characters and Unicode ranges, escaping must not replace invalid input.
		if character != '\t' && character != '\n' && character != '\r' &&
			!(character >= 0x20 && character <= 0xD7FF) &&
			!(character >= 0xE000 && character <= 0xFFFD) &&
			!(character >= 0x10000 && character <= 0x10FFFF) {
			return "", errProvider
		}
	}
	var escaped bytes.Buffer
	if err := xml.EscapeText(&escaped, []byte(text)); err != nil {
		return "", errProvider
	}
	return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="` + voice + `"><lang xml:lang="` + language + `">` + escaped.String() + `</lang></voice></speak>`, nil
}
