import { router } from 'expo-router';
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
import { talkVoiceControl } from './talk-control';
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
  const [confirmed, setConfirmed] = useState(false);
  const [voiceChoice, setVoiceChoice] = useState(true);
  const [exitIntent, setExitIntent] = useState<'end' | 'back' | null>(null);
  const connected = session.connected;
  const busy = checking || session.status === 'connecting' || session.status === 'thinking';
  const listening = session.status === 'listening';
  const speaking = session.status === 'speaking';
  const exhausted =
    connected &&
    session.remainingTurns === 0 &&
    (session.status === 'ready' || session.status === 'paused');
  const canStart = !connected && session.status !== 'connecting' && !checking;
  const unread =
    session.responsePending && (session.status === 'ready' || session.status === 'paused');
  const control = talkVoiceControl(
    session.status,
    session.recognitionSupported,
    session.responsePending,
  );
  const actionable =
    (session.status === 'ready' || session.status === 'paused') &&
    session.responseId !== null &&
    !session.responsePending &&
    !exhausted;
  const status = checking
    ? sessionCopy[locale].wait
    : listening
      ? copy.microphoneOn
      : session.status === 'ready' || session.status === 'paused'
        ? copy.microphoneOff
        : sessionCopy[locale].status[session.status];
  const level =
    listening && session.inputLevel !== null
      ? Math.round(Math.sqrt(Math.max(0, Math.min(1, session.inputLevel))) * 100)
      : null;
  const panel = session.panel;
  const panelTitle =
    panel !== null && 'title' in panel
      ? panel.title
      : panel?.type === 'propose_feedback'
        ? harness.feedback
        : harness.end;

  async function begin() {
    if (confirmed) {
      setShowComposer(!voiceChoice);
      if (exhausted) void session.connect(voiceChoice);
      else void session.reconnect(voiceChoice);
      return;
    }
    setChecking(true);
    const enabled = await session.checkAvailability();
    setAvailable(enabled === true);
    setChecking(false);
    setSheet('access');
  }
  function connect(voice: boolean) {
    setSheet(null);
    setConfirmed(true);
    setVoiceChoice(voice);
    setShowComposer(!voice);
    void session.connect(voice);
  }
  function end() {
    setSheet(null);
    setShowComposer(false);
    session.end();
  }
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }
  function requestExit(intent: 'end' | 'back') {
    if (!connected && session.status !== 'connecting') {
      if (intent === 'back') goBack();
      else end();
      return;
    }
    session.pause();
    setSheet(null);
    setExitIntent(intent);
  }
  function confirmExit() {
    const leaving = exitIntent === 'back';
    setExitIntent(null);
    end();
    if (leaving) goBack();
  }
  function pressMicrophone() {
    setShowComposer(false);
    if (control.action === 'resume' || control.action === 'interrupt') {
      setVoiceChoice(session.recognitionSupported);
    }
    if (control.action === 'pause') session.pause();
    else if (control.action === 'interrupt') {
      session.interrupt();
      if (session.recognitionSupported) session.resume();
    } else if (control.action === 'resume') session.resume();
  }
  function act(action: HarnessActionId) {
    if (action === 'end_session') requestExit('end');
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
        status=""
        state={session.status}
        animation={session.animation}
        prop={panel?.type === 'show_hint' || panel?.type === 'show_outline' ? 'idea-card' : 'none'}
        quiet={
          (panel !== null && !speaking) || sheet !== null || exitIntent !== null || showComposer
        }
        info={{ title: sessionCopy[locale].talk.title, body: copy.about, actions }}
        onInfoOpen={session.pause}
        onBack={() => {
          requestExit('back');
        }}
        {...(canStart ? { onMoriiPress: () => void begin(), moriiLabel: copy.start } : {})}
        {...(connected || session.status === 'connecting'
          ? {
              onEnd: () => {
                requestExit('end');
              },
            }
          : {})}
        footer={
          <>
            <Text
              accessibilityLiveRegion="polite"
              className="text-center text-sm leading-5 text-teal"
            >
              {status}
            </Text>
            {level !== null && (
              <View
                accessibilityRole="progressbar"
                accessibilityLabel={copy.inputLevel}
                accessibilityValue={{ min: 0, max: 100, now: level }}
                className="h-2 overflow-hidden rounded-full bg-line"
              >
                <View
                  className="h-full w-full rounded-full bg-teal"
                  style={{ transform: [{ scaleX: level / 100 }], transformOrigin: 'left center' }}
                />
              </View>
            )}
            {session.transcript !== '' && (
              <Text numberOfLines={2} className="text-center text-base leading-6 text-muted">
                {copy.heard}: {session.transcript}
              </Text>
            )}
            {!connected || exhausted ? (
              <>
                {exhausted && <Note>{copy.limit}</Note>}
                {!connected && confirmed && session.error !== null && (
                  <Note>{copy.newSession}</Note>
                )}
                <Button disabled={busy} onPress={() => void begin()}>
                  {confirmed
                    ? session.error !== null
                      ? copy.reconnect
                      : copy.newConversation
                    : copy.start}
                </Button>
              </>
            ) : (
              <>
                <View className="flex-row items-center justify-center gap-3">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy[control.label]}
                    accessibilityState={{ disabled: control.disabled }}
                    disabled={control.disabled}
                    onPress={pressMicrophone}
                    className={`min-h-14 min-w-0 flex-1 flex-row items-center justify-center gap-3 rounded-full px-5 py-3 ${listening ? 'bg-peach' : 'bg-teal'} ${control.disabled ? 'opacity-40' : 'active:opacity-75'}`}
                  >
                    <Icon name={control.icon} size={24} color={listening ? '#183D37' : '#FFFFFF'} />
                    <Text
                      className={`shrink text-center text-base font-semibold ${listening ? 'text-ink' : 'text-white'}`}
                    >
                      {copy[control.label]}
                    </Text>
                  </Pressable>
                  <View className="w-26">
                    <Button
                      variant="secondary"
                      expanded={showComposer}
                      onPress={() => {
                        session.pause();
                        if (!showComposer) setVoiceChoice(false);
                        setShowComposer(!showComposer);
                      }}
                    >
                      {showComposer ? copy.keyboardClose : copy.type}
                    </Button>
                  </View>
                </View>
                {listening && session.transcript !== '' && (
                  <Button variant="secondary" onPress={session.finishVoice}>
                    {copy.finish}
                  </Button>
                )}
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
            )}
          </>
        }
      >
        {session.response !== '' &&
          (showCaptions || session.responsePending || !connected) &&
          (panel === null || !connected) && (
            <View className="rounded-3xl bg-surface px-5 py-4">
              <Text className="text-lg leading-7 text-ink">{session.response}</Text>
            </View>
          )}
        {session.error !== null && <Note>{session.error}</Note>}
      </SessionStage>
      <Sheet
        visible={exitIntent !== null}
        title={exitIntent === 'back' ? copy.leaveTitle : copy.endTitle}
        closeLabel={copy.stay}
        onClose={() => {
          setExitIntent(null);
        }}
      >
        <Paragraph>{copy.exitBody}</Paragraph>
        <Button onPress={confirmExit}>{exitIntent === 'back' ? copy.leave : copy.end}</Button>
        <Button
          variant="secondary"
          onPress={() => {
            setExitIntent(null);
          }}
        >
          {copy.stay}
        </Button>
      </Sheet>
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
        visible={panel !== null && connected && sheet === null && exitIntent === null}
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
