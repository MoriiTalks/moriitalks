package voice

import (
	"strings"
	"unicode/utf8"
)

// Preview uses transparent scripted rules, it does not pretend to evaluate speech or call AI.
func scriptedHarnessReply(input harnessInput) harnessReply {
	id := input.Language == "id"
	choose := func(indonesian, english string) string {
		if id {
			return indonesian
		}
		return english
	}
	reply := harnessReply{Animation: "neutral"}
	lower := strings.ToLower(input.Speech)
	switch {
	case input.Action == "end_session" || previewEndRequest(lower):
		reply.Text = choose("Kita boleh berhenti di sini. Kamu bisa kembali saat ingin berlatih lagi.", "We can stop here. You can return whenever you want to practice.")
		reply.Panel = &harnessPanel{Type: "request_end_session", Text: choose("Selesai untuk sekarang?", "Finish for now?")}
	case input.Action == "finish":
		reply.Text = choose("Latihan ini selesai. Kalau ingin mencoba lagi, kita bisa berlatih ide dan alasan.", "This practice is finished. If you want another try, we can practice an idea and a reason.")
		reply.Animation = "encourage"
		reply.Panel = &harnessPanel{Type: "propose_next_mission", MissionID: "first-explanation", Title: choose("Ide dan alasan", "An idea and a reason"), Text: choose("Ulangi dengan topik baru, atau selesai untuk sekarang.", "Try a new topic, or finish for now.")}
		if input.Mode == "talk" {
			reply.Text = choose("Obrolan ini selesai. Jika ingin berlatih, kita bisa mencoba ide dan alasan.", "This conversation is finished. If you want to practice, we can try an idea and a reason.")
			reply.Panel.Text = choose("Coba latihan ini, atau selesai untuk sekarang.", "Try this practice, or finish for now.")
		}
	case input.Action == "hint" || strings.Contains(lower, "hint") || strings.Contains(lower, "petunjuk"):
		reply.Text = choose("Pilih satu hal yang kamu suka, lalu tambahkan alasanmu sendiri.", "Choose one thing you enjoy, then add your own reason.")
		reply.Panel = &harnessPanel{Type: "show_hint", Title: choose("Satu petunjuk", "One hint"), Text: choose("Mulai dengan: Aku suka … karena …", "Start with: I enjoy … because …")}
	case input.Action == "outline" || input.Action == "retry" || input.Action == "start_mission" || strings.Contains(lower, "outline") || strings.Contains(lower, "kerangka") || strings.Contains(lower, "start a practice") || strings.Contains(lower, "memulai latihan"):
		reply.Text = choose("Ceritakan satu hal yang kamu suka. Kita mulai dengan idemu dan satu alasan.", "Tell me one thing you enjoy. Start with your idea and one reason.")
		reply.Panel = &harnessPanel{Type: "show_outline", Title: choose("Giliranmu bercerita", "Your turn to tell a story"), Parts: []string{choose("Ide: apa yang kamu suka?", "Idea: what do you enjoy?"), choose("Alasan: mengapa kamu menyukainya?", "Reason: why do you enjoy it?"), choose("Contoh kecil, jika kamu ingin", "A small example, if you want")}}
	case knownTopic(input.Action):
		reply.Text = choose("Topikmu sudah dipilih. Ceritakan satu hal tentang topik itu.", "Your topic is chosen. Tell me one thing about it.")
		reply.Animation = "wave"
	case strings.Contains(lower, "choose a topic") || strings.Contains(lower, "memilih topik") || strings.Contains(lower, "bingung"):
		reply.Text = choose("Kamu mau bercerita tentang apa? Pilih satu topik yang kamu sukai.", "What would you like to talk about? Choose a topic you enjoy.")
		reply.Animation = "wave"
		reply.Panel = &harnessPanel{Type: "show_choices", Title: choose("Pilih ceritamu", "Choose your story"), Choices: []harnessChoice{{"hobby", choose("Hobiku", "My hobbies")}, {"day", choose("Hari ini", "Today")}, {"ideas", choose("Ideku", "My idea")}}}
	case input.Mode == "practice":
		reply = scriptedFeedback(input, choose)
	default:
		reply.Text = choose("Apa satu hal yang paling ingin kamu ceritakan tentang topik itu?", "What is one thing you would most like to share about that topic?")
	}
	return reply
}

// Explicit requests keep hobby stories such as stop motion from ending the preview.
func previewEndRequest(text string) bool {
	switch strings.Trim(strings.TrimSpace(text), ".!?") {
	case "stop", "stop now", "please stop", "i want to stop", "i want to stop now", "berhenti", "aku ingin berhenti", "aku ingin berhenti sekarang":
		return true
	}
	return false
}

func scriptedFeedback(input harnessInput, choose func(string, string) string) harnessReply {
	quote := input.Speech
	for textUnits(quote) > 300 {
		_, size := utf8.DecodeLastRuneInString(quote)
		quote = quote[:len(quote)-size]
	}
	if !safeVisibleText(quote, 300) {
		return harnessReply{Text: choose("Coba gunakan contoh sederhana tentang hobi tanpa informasi pribadi.", "Try a simple hobby example without personal details."), Animation: "neutral", Panel: &harnessPanel{Type: "propose_feedback", Quote: "", Observation: choose("Contoh ini belum dapat diamati dengan jelas.", "This example cannot be observed clearly yet."), NextStep: choose("Ceritakan satu hobi dan alasanmu.", "Share one hobby and your reason."), RubricID: "idea-and-reason-v1", Status: "unassessable"}}
	}
	hasReason := strings.Contains(strings.ToLower(input.Speech), "because") || strings.Contains(strings.ToLower(input.Speech), "karena")
	observation := choose("Kamu menyebut sebuah ide.", "You shared an idea.")
	nextStep := choose("Tambahkan satu alasan dengan kata karena.", "Add one reason using because.")
	status := "needs_practice"
	if hasReason {
		observation = choose("Contohmu memakai kata karena untuk memberi alasan.", "Your example uses because to give a reason.")
		nextStep = choose("Coba tambahkan satu contoh yang mendukung alasanmu.", "Try adding one example that supports your reason.")
		status = "observed"
	}
	return harnessReply{Text: observation + " " + nextStep, Animation: "encourage", Panel: &harnessPanel{Type: "propose_feedback", Quote: quote, Observation: observation, NextStep: nextStep, RubricID: "idea-and-reason-v1", Status: status}}
}
