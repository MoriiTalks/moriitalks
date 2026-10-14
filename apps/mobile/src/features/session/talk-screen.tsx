import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { HarnessActionId } from '@contracts/harness';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { Sheet } from '@/components/sheet';
import { Note, Paragraph } from '@/components/typography';
import { useApp } from '@/state/app-context';

import { deviceTalkCopy } from './device-talk-copy';
import { harnessCopy } from './harness-copy';
import { HarnessPanelView } from './harness-panel';
import { sessionCopy } from './session-copy';
import { SessionStage } from './session-stage';
import { useDeviceTalk } from './use-device-talk';

// Draft text stays on this screen, submission is always an explicit action.
function MessageComposer({
  busy,
  placeholder,
  sendLabel,
  onSubmit,
}: {
  busy: boolean;
  placeholder: string;
  sendLabel: string;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  function submit() {
    const message = text.trim();
    if (message === '' || busy) return;
    onSubmit(message);
    setText('');
  }
  return (
    <View className="min-w-0 flex-row items-center gap-2 rounded-3xl border border-line bg-surface p-1.5">
      <TextInput
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor="#5C7068"
        value={text}
        editable={!busy}
        maxLength={1000}
        onChangeText={setText}
        onSubmitEditing={submit}
        returnKeyType="send"
        className="min-h-12 min-w-0 flex-1 rounded-3xl px-3 py-2 text-lg text-ink"
      />
      <IconButton
        icon="send"
        label={sendLabel}
        primary
        disabled={busy || text.trim() === ''}
        onPress={submit}
      />
    </View>
  );
}

// The call owns speech turns, the harness controls one drawer and Morii's approved gestures.
export function TalkScreen() {
  const { locale } = useApp();
  const session = useDeviceTalk({ locale, mode: 'talk', topic: 'ideas' });
  const copy = deviceTalkCopy[locale];
  const harness = harnessCopy[locale];
  const [showComposer, setShowComposer] = useState(false);
  const [showCaptions, setShowCaptions] = useState(false);
  const [sheet, setSheet] = useState<'access' | 'details' | null>(null);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState(false);
  const connected = session.connected;
  const busy = checking || session.status === 'connecting' || session.status === 'thinking';
  const listening = session.status === 'listening';
  const speaking = session.status === 'speaking';
  const exhausted = connected && session.remainingTurns === 0 && session.status === 'ready';
  const canStart = !connected && session.status !== 'connecting' && !checking;
  const unread = session.responsePending && session.status === 'ready';
  const canInterrupt = speaking || session.status === 'thinking';
  const microphoneDisabled = unread || (!session.recognitionSupported && !canInterrupt);
  const actionable =
    session.status === 'ready' &&
    session.responseId !== null &&
    !session.responsePending &&
    !exhausted;
  const primaryLabel =
    speaking || session.status === 'thinking'
      ? copy.interrupt
      : listening
        ? copy.finish
        : copy.resume;
  const panel = session.panel;
  const panelTitle =
    panel !== null && 'title' in panel
      ? panel.title
      : panel?.type === 'propose_feedback'
        ? harness.feedback
        : harness.end;

  async function begin() {
    setChecking(true);
    const enabled = await session.checkAvailability();
    setAvailable(enabled === true);
    setChecking(false);
    setSheet('access');
  }
  function connect(voice: boolean) {
    setSheet(null);
    setShowComposer(!voice);
    void session.connect(voice);
  }
  function end() {
    setSheet(null);
    setShowComposer(false);
    session.end();
  }
  function pressMicrophone() {
    setShowComposer(false);
    if (listening) session.finishVoice();
    else if (speaking || session.status === 'thinking') session.interrupt();
    else session.resume();
  }
  function act(action: HarnessActionId) {
    if (action === 'end_session') end();
    else session.act(action);
  }
  const actions = connected
    ? [
        {
          label: copy.details,
          onPress: () => {
            session.pause();
            setSheet('details');
          },
        },
        {
          label: showCaptions ? copy.hideText : copy.showText,
          onPress: () => {
            setShowCaptions(!showCaptions);
          },
        },
      ]
    : [];

  return (
    <>
      <SessionStage
        status={checking ? sessionCopy[locale].wait : sessionCopy[locale].status[session.status]}
        state={session.status}
        animation={session.animation}
        prop={panel?.type === 'show_hint' || panel?.type === 'show_outline' ? 'idea-card' : 'none'}
        quiet={(panel !== null && !speaking) || sheet !== null || showComposer}
        info={{ title: sessionCopy[locale].talk.title, body: copy.about, actions }}
        onInfoOpen={session.pause}
        {...(canStart ? { onMoriiPress: () => void begin(), moriiLabel: copy.start } : {})}
        {...(connected || session.status === 'connecting' ? { onEnd: end } : {})}
        footer={
          !connected ? (
            <Text className="py-3 text-center text-lg leading-7 text-muted">
              {busy ? sessionCopy[locale].wait : copy.start}
            </Text>
          ) : exhausted ? (
            <View className="gap-2">
              <Note>{copy.limit}</Note>
              <Button onPress={end}>{copy.end}</Button>
            </View>
          ) : (
            <>
              <View className="flex-row items-center justify-center gap-6">
                <IconButton
                  icon="pause"
                  label={copy.pause}
                  disabled={!session.voiceActive && !listening && !speaking && !busy}
                  onPress={session.pause}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={primaryLabel}
                  accessibilityState={{ disabled: microphoneDisabled }}
                  disabled={microphoneDisabled}
                  onPress={pressMicrophone}
                  className={`size-18 items-center justify-center rounded-full ${listening ? 'bg-peach' : 'bg-teal'} ${microphoneDisabled ? 'opacity-40' : 'active:opacity-75'}`}
                >
                  <Icon
                    name={speaking || busy ? 'pause' : listening ? 'check' : 'mic'}
                    size={28}
                    color={listening ? '#183D37' : '#FFFFFF'}
                  />
                </Pressable>
                <IconButton
                  icon="chat"
                  label={showComposer ? copy.keyboardClose : copy.type}
                  expanded={showComposer}
                  onPress={() => {
                    session.pause();
                    setShowComposer(!showComposer);
                  }}
                />
              </View>
              {unread && <Button onPress={session.continueText}>{copy.read}</Button>}
              {showComposer && (
                <MessageComposer
                  busy={busy || listening || speaking || session.responsePending}
                  placeholder={copy.placeholder}
                  sendLabel={copy.send}
                  onSubmit={session.submitText}
                />
              )}
            </>
          )
        }
      >
        {session.response !== '' && (showCaptions || session.responsePending) && panel === null && (
          <View className="rounded-3xl bg-surface px-5 py-4">
            <Text className="text-lg leading-7 text-ink">{session.response}</Text>
          </View>
        )}
        {session.error !== null && <Note>{session.error}</Note>}
      </SessionStage>
      <Sheet
        visible={sheet === 'access' && canStart}
        title={copy.access}
        closeLabel={harness.close}
        onClose={() => {
          setSheet(null);
        }}
      >
        {available ? (
          <>
            <Paragraph>{copy.adult}</Paragraph>
            <Note>{copy.privacy}</Note>
            {session.recognitionSupported ? (
              <Button
                onPress={() => {
                  connect(true);
                }}
              >
                {copy.voice}
              </Button>
            ) : (
              <Note>{copy.recognition}</Note>
            )}
            <Button
              variant="secondary"
              onPress={() => {
                connect(false);
              }}
            >
              {copy.typed}
            </Button>
          </>
        ) : (
          <Paragraph>{copy.unavailable}</Paragraph>
        )}
      </Sheet>
      <Sheet
        visible={sheet === 'details' && connected}
        title={copy.conversation}
        closeLabel={harness.close}
        onClose={() => {
          setSheet(null);
        }}
      >
        {session.response !== '' && <Paragraph>{session.response}</Paragraph>}
        {session.transcript !== '' && (
          <Note>
            {copy.heard}: {session.transcript}
          </Note>
        )}
        {session.response === '' && session.transcript === '' && <Note>{copy.ready}</Note>}
      </Sheet>
      <Sheet
        visible={panel !== null && connected && sheet === null}
        title={panelTitle}
        closeLabel={harness.close}
        onClose={session.dismissPanel}
      >
        {panel !== null && (
          <HarnessPanelView
            panel={panel}
            locale={locale}
            presentation="sheet"
            disabled={!actionable}
            canEnd={connected}
            busy={busy}
            {...(session.responsePending ? { intro: session.response } : {})}
            onAction={act}
            onDismiss={session.dismissPanel}
          />
        )}
        {unread && <Button onPress={session.continueText}>{copy.read}</Button>}
      </Sheet>
    </>
  );
}
