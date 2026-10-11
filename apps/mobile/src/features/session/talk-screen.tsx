import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { Sheet } from '@/components/sheet';
import { Note, Paragraph } from '@/components/typography';
import { useApp } from '@/state/app-context';

import { harnessCopy } from './harness-copy';
import { HarnessPanelView, HarnessTools } from './harness-panel';
import { sessionCopy } from './session-copy';
import { SessionStage } from './session-stage';
import { useVoiceSession } from './use-voice-session';

// Draft text exists only while the connected composer is mounted.
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

type Availability = 'available' | 'disabled' | 'unsupported' | 'unreachable';

// Morii stays central, live testing and scripted examples are explicit choices before connection.
export function TalkScreen() {
  const { locale } = useApp();
  const [showTools, setShowTools] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [showCaptions, setShowCaptions] = useState(false);
  const [sheet, setSheet] = useState<'access' | 'details' | null>(null);
  const [availability, setAvailability] = useState<Availability>('disabled');
  const session = useVoiceSession({ locale, mode: 'talk', topic: 'ideas' });
  const copy = sessionCopy[locale];
  const harness = harnessCopy[locale];
  const live = session.kind === 'live';
  const canStart = ['idle', 'paused', 'ended', 'error'].includes(session.status);
  const connected = ['ready', 'listening', 'thinking', 'speaking'].includes(session.status);
  const busy = session.status === 'connecting' || session.status === 'thinking';
  const listening = session.status === 'listening';
  const speaking = session.status === 'speaking';
  const exhausted = connected && session.remainingTurns === 0 && session.status === 'ready';
  const actionable = session.status === 'ready' && session.responseId !== null && !exhausted;
  const primaryLabel = speaking ? copy.interrupt : listening ? copy.send : copy.record;

  async function begin() {
    setShowTools(false);
    setShowComposer(false);
    const result = await session.checkLiveAvailability();
    if (result === null) return;
    setAvailability(result);
    setSheet('access');
  }

  function end() {
    setSheet(null);
    setShowTools(false);
    setShowComposer(false);
    session.end();
  }

  function startExample() {
    setSheet(null);
    setShowTools(false);
    void session.connectPreview();
  }

  function pressMicrophone() {
    setShowTools(false);
    if (speaking) session.interrupt();
    else if (listening) void session.commitTurn();
    else void session.startTurn();
  }

  const actions = canStart
    ? [
        {
          label: copy.talk.checkVoice,
          onPress: () => {
            void begin();
          },
        },
        { label: copy.talk.typedExample, onPress: startExample },
      ]
    : connected
      ? [
          {
            label: copy.talk.showConversation,
            onPress: () => {
              setSheet('details');
            },
          },
          ...(live
            ? [
                {
                  label: showCaptions ? copy.hideTranscript : copy.showTranscript,
                  onPress: () => {
                    setShowCaptions((shown) => !shown);
                  },
                },
              ]
            : []),
        ]
      : [];

  return (
    <>
      <SessionStage
        status={copy.status[session.status]}
        state={session.status}
        animation={session.animation}
        info={{
          title: copy.talk.title,
          body: connected ? (live ? copy.labNote : harness.previewNote) : copy.talk.about,
          actions,
        }}
        {...(canStart ? { onMoriiPress: () => void begin(), moriiLabel: harness.start } : {})}
        {...(!canStart ? { onEnd: end } : {})}
        footer={
          !connected ? (
            <Text className="py-3 text-center text-lg leading-7 text-muted">
              {busy ? copy.wait : copy.talk.start}
            </Text>
          ) : exhausted ? (
            <Button onPress={end}>{harness.end}</Button>
          ) : (
            <>
              {actionable && session.panel === null && (
                <HarnessTools
                  locale={locale}
                  expanded={showTools}
                  onToggle={() => {
                    setShowTools((shown) => !shown);
                  }}
                  onAction={(action) => {
                    session.act(action);
                    setShowTools(false);
                  }}
                />
              )}
              {live ? (
                <>
                  <View className="flex-row items-center justify-center gap-6">
                    <IconButton
                      icon="pause"
                      label={copy.talk.mute}
                      disabled={!listening && !speaking}
                      onPress={session.interrupt}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={primaryLabel}
                      accessibilityState={{ disabled: busy }}
                      disabled={busy}
                      onPress={pressMicrophone}
                      className={`size-18 items-center justify-center rounded-full ${listening ? 'bg-peach' : 'bg-teal'} ${busy ? 'opacity-40' : 'active:opacity-75'}`}
                    >
                      <Icon
                        name={speaking ? 'pause' : listening ? 'check' : 'mic'}
                        size={28}
                        color={listening ? '#183D37' : '#FFFFFF'}
                      />
                    </Pressable>
                    <IconButton
                      icon="chat"
                      label={copy.talk.typeMessage}
                      expanded={showComposer}
                      disabled={busy || listening || speaking}
                      onPress={() => {
                        setShowComposer((shown) => !shown);
                        setShowTools(false);
                      }}
                    />
                  </View>
                  <Text className="text-center text-base leading-6 text-muted">
                    {busy ? copy.wait : primaryLabel}
                  </Text>
                </>
              ) : speaking ? (
                <Button variant="secondary" onPress={session.interrupt}>
                  {copy.interrupt}
                </Button>
              ) : null}
              {(!live || showComposer) && (
                <MessageComposer
                  busy={busy || listening || speaking}
                  placeholder={harness.placeholder}
                  sendLabel={harness.send}
                  onSubmit={(message) => {
                    session.submitText(message);
                    setShowTools(false);
                  }}
                />
              )}
            </>
          )
        }
      >
        {session.response !== '' && session.panel === null && (!live || showCaptions) && (
          <View className="rounded-3xl bg-surface px-5 py-4">
            <Text className="text-lg leading-7 text-ink">{session.response}</Text>
          </View>
        )}
        {session.panel !== null && (
          <HarnessPanelView
            panel={session.panel}
            locale={locale}
            disabled={!actionable}
            canEnd={connected && !busy && !listening && !speaking}
            busy={busy || listening || speaking}
            {...(!live && session.error !== null ? { intro: session.response } : {})}
            onAction={session.act}
            onDismiss={session.dismissPanel}
          />
        )}
        {session.error !== null && <Note>{session.error}</Note>}
      </SessionStage>
      <Sheet
        visible={sheet === 'access' && canStart}
        title={availability === 'available' ? copy.lab : copy.talk.greeting}
        closeLabel={harness.close}
        onClose={() => {
          setSheet(null);
        }}
      >
        <Paragraph>
          {availability === 'available'
            ? copy.labNote
            : availability === 'unsupported'
              ? copy.talk.unsupported
              : availability === 'unreachable'
                ? copy.talk.unreachable
                : copy.talk.disabled}
        </Paragraph>
        {availability === 'available' && (
          <>
            <Note>{copy.talk.adultOnly}</Note>
            <Button
              onPress={() => {
                setSheet(null);
                void session.startLive();
              }}
            >
              {copy.consent}
            </Button>
          </>
        )}
        <Button variant="secondary" onPress={startExample}>
          {copy.talk.typedExample}
        </Button>
        <Note>{harness.previewNote}</Note>
      </Sheet>
      <Sheet
        visible={sheet === 'details' && connected}
        title={copy.talk.conversation}
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
        {session.response === '' && session.transcript === '' && <Note>{copy.talk.ready}</Note>}
      </Sheet>
    </>
  );
}
