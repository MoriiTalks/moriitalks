package voice

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestDeviceTalkRetainsAcknowledgedOutlineAfterDismissal(t *testing.T) {
	for _, acknowledgeFirst := range []bool{false, true} {
		t.Run(fmt.Sprint(acknowledgeFirst), func(t *testing.T) {
			outline := &harnessPanel{Type: "show_outline", Title: "Es mencair", Parts: []string{"Alat percobaan.", "Perubahan pada es.", "Hasil pengamatan."}}
			coach := &fakeHarnessProvider{result: &harnessReply{Text: "Ini kerangka presentasimu.", Animation: "neutral", Panel: outline}}
			providers := &fakeProviders{}
			lab, server := testServer(t, deviceConfig("http://127.0.0.1:1234"), providers)
			lab.deviceCoach = coach
			client := connectDeviceClient(t, server, true)
			client.until("session.ready")
			first := client.text(1, "Buat kerangka presentasi tentang es mencair.")
			ack := fmt.Sprintf(`{"type":"response.played","version":2,"turnId":1,"generation":1,"responseId":%q}`, first.ResponseID)
			dismiss := fmt.Sprintf(`{"type":"panel.dismiss","version":2,"generation":1,"responseId":%q}`, first.ResponseID)
			if acknowledgeFirst {
				client.send(ack)
				client.send(dismiss)
			} else {
				client.send(dismiss)
				client.send(ack)
			}
			client.text(2, "Jelaskan bagian kedua.")
			inputs := coach.snapshot()
			if len(inputs) != 2 || len(inputs[1].History) != 1 || inputs[1].Speech != "Jelaskan bagian kedua." {
				t.Fatal("a drawer follow-up lost its accepted turn or made extra model calls")
			}
			history := inputs[1].History[0]
			if history.HeardReply != first.Text || history.Panel == nil || history.Panel.Title != outline.Title || len(history.Panel.Parts) != 3 || history.Panel.Parts[1] != "Perubahan pada es." {
				t.Fatalf("the acknowledged second outline item was lost after dismissal: %+v", history)
			}
			encoded, err := json.Marshal(inputs[1])
			if err != nil || !strings.Contains(string(encoded), `"panel":{"type":"show_outline"`) || !strings.Contains(string(encoded), "Perubahan pada es.") {
				t.Fatal("the typed panel context was omitted from model input JSON")
			}
			if providers.listens.Load()+providers.speech.Load()+providers.responses.Load() != 0 {
				t.Fatal("context retention contacted cloud speech")
			}
		})
	}
}

func TestDeviceTalkDoesNotTreatUnreadDrawerAsPresentedContext(t *testing.T) {
	coach := &fakeHarnessProvider{result: &harnessReply{Text: "Ini kerangka presentasimu.", Animation: "neutral", Panel: &harnessPanel{Type: "show_outline", Title: "Es mencair", Parts: []string{"Alat.", "Pengamatan."}}}}
	lab, server := testServer(t, deviceConfig("http://127.0.0.1:1234"), &fakeProviders{})
	lab.deviceCoach = coach
	client := connectDeviceClient(t, server, true)
	client.until("session.ready")
	client.text(1, "Buat kerangka tentang es mencair.")
	client.text(2, "Tolong ulangi.")
	inputs := coach.snapshot()
	if len(inputs) != 2 || len(inputs[1].History) != 1 || inputs[1].History[0].HeardReply != "" || inputs[1].History[0].Panel != nil {
		t.Fatal("an unread drawer was treated as acknowledged context")
	}
	encoded, err := json.Marshal(inputs[1].History[0])
	if err != nil || strings.Contains(string(encoded), `"panel"`) {
		t.Fatal("an absent drawer was not omitted from history JSON")
	}
}

func TestDeviceTalkChoiceCarriesTheValidatedVisibleLabel(t *testing.T) {
	label := "Bagaimana es mencair"
	coach := &fakeHarnessProvider{result: &harnessReply{Text: "Pilih topik yang ingin kamu jelaskan.", Animation: "neutral", Panel: &harnessPanel{Type: "show_choices", Title: "Topik presentasi", Choices: []harnessChoice{{ID: "day", Label: label}}}}}
	lab, server := testServer(t, deviceConfig("http://127.0.0.1:1234"), &fakeProviders{})
	lab.deviceCoach = coach
	client := connectDeviceClient(t, server, true)
	client.until("session.ready")
	first := client.text(1, "Beri pilihan topik presentasi.")
	client.send(fmt.Sprintf(`{"type":"response.played","version":2,"turnId":1,"generation":1,"responseId":%q}`, first.ResponseID))
	client.action(2, first.ResponseID, "day")
	inputs := coach.snapshot()
	if len(inputs) != 2 || inputs[1].Action != "day" || inputs[1].Speech != `Aku memilih topik "Bagaimana es mencair".` {
		t.Fatalf("the selected visible topic became a generic category: %+v", inputs)
	}
	if inputs[1].History[0].Panel == nil || inputs[1].History[0].Panel.Choices[0].Label != label {
		t.Fatal("the displayed choice label was lost from acknowledged history")
	}
	if actionSpeech("day", "en", coach.result.Panel) != `I choose the topic "Bagaimana es mencair".` {
		t.Fatal("the English action changed the selected label")
	}
}

func TestHarnessContextBudgetsIncludeVisiblePanelText(t *testing.T) {
	panel := &harnessPanel{Type: "show_outline", Title: strings.Repeat("t", 60), Parts: []string{strings.Repeat("a", 100), strings.Repeat("b", 100), strings.Repeat("c", 100)}}
	history := []harnessHistory{
		{Speech: strings.Repeat("x", 1000), HeardReply: strings.Repeat("y", 400), Panel: panel},
		{Speech: strings.Repeat("z", 1000), HeardReply: strings.Repeat("w", 400), Panel: panel},
	}
	if boundedCoachInput(harnessInput{Speech: "Explain the second item.", History: history}) {
		t.Fatal("visible drawers escaped the shared 3000-unit history budget")
	}
	bounded := boundedHarnessHistory(history)
	if len(bounded) != 1 || bounded[0].Speech != history[1].Speech || harnessHistoryUnits(bounded[0]) > 3000 || !boundedCoachInput(harnessInput{Speech: "Explain the second item.", History: bounded}) {
		t.Fatal("history did not preserve the whole most recent turn within its shared budget")
	}
	for _, invalid := range []harnessHistory{
		{Speech: "Idea.", HeardReply: "Reply.", Panel: &harnessPanel{Type: "show_hint", Text: strings.Repeat("x", maxHarnessPanelContext+1)}},
		{Speech: "Idea.", Panel: panel},
	} {
		if boundedCoachInput(harnessInput{Speech: "Explain this.", History: []harnessHistory{invalid}}) {
			t.Fatal("oversized or unacknowledged panel context reached admission")
		}
	}
}
