import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { IconButton } from '@/components/icon-button';
import { Note } from '@/components/typography';
import { useApp } from '@/state/app-context';

import { harnessCopy } from './harness-copy';
import { HarnessPanelView, HarnessTools } from './harness-panel';
import { sessionCopy } from './session-copy';
import { SessionStage } from './session-stage';
import { useVoiceSession } from './use-voice-session';

// Draft text exists only while the connected preview composer is mounted.
function PreviewComposer({
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
    <View className="min-w-0 flex-row items-center gap-2 rounded-full border border-line bg-surface p-1.5">
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
        className="min-h-12 min-w-0 flex-1 rounded-full px-3 py-2 text-base text-ink"
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

// The quiet entry point previews approved UI actions with scripted replies and typed input.
export function TalkScreen() {
  const { locale } = useApp();
  const [showTools, setShowTools] = useState(false);
  const session = useVoiceSession({ locale, mode: 'talk', topic: 'hobby' });
  const copy = sessionCopy[locale];
  const harness = harnessCopy[locale];
  const id = locale === 'id';
  const connected =
    session.kind === 'preview' && ['ready', 'thinking', 'speaking'].includes(session.status);
  const busy =
    session.status === 'connecting' ||
    session.status === 'thinking' ||
    session.status === 'speaking';
  const exhausted = connected && session.remainingTurns === 0;
  const actionable = session.status === 'ready' && session.responseId !== null && !exhausted;

  function begin() {
    setShowTools(false);
    void session.connectPreview();
  }

  function end() {
    setShowTools(false);
    session.end();
  }

  return (
    <SessionStage
      status={copy.status[session.status]}
      state={session.status}
      animation={session.animation}
      info={{
        title: id ? 'Bercerita dengan Morii' : 'Talking with Morii',
        body: id
          ? 'Versi ini memakai pesan tertulis dan jawaban contoh untuk mencoba interaksi Morii. Mikrofon tidak digunakan. Jawaban ini belum berasal dari percakapan AI langsung.'
          : 'This version uses typed messages and sample replies to try Morii’s interactions. The microphone is not used. Replies are not yet from a live AI conversation.',
      }}
      {...(!connected && !busy ? { onMoriiPress: begin, moriiLabel: harness.start } : {})}
      {...(connected || busy ? { onEnd: end } : {})}
      footer={
        !connected ? (
          <Text className="py-3 text-center text-base leading-6 text-muted">
            {busy ? copy.wait : id ? 'Ketuk Morii untuk menyapa' : 'Tap Morii to say hello'}
          </Text>
        ) : exhausted ? (
          <Button onPress={end}>{harness.end}</Button>
        ) : (
          <>
            {actionable && (
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
            <PreviewComposer
              busy={busy}
              placeholder={harness.placeholder}
              sendLabel={harness.send}
              onSubmit={(message) => {
                session.submitText(message);
                setShowTools(false);
              }}
            />
          </>
        )
      }
    >
      {session.response !== '' && session.panel === null && (
        <View className="rounded-3xl bg-surface px-5 py-4">
          <Text className="text-lg leading-7 text-ink">{session.response}</Text>
        </View>
      )}
      {session.panel !== null && (
        <HarnessPanelView
          panel={session.panel}
          locale={locale}
          disabled={!actionable}
          canEnd={connected && !busy}
          busy={busy}
          onAction={session.act}
          onDismiss={session.dismissPanel}
        />
      )}
      {session.error !== null && <Note>{session.error}</Note>}
    </SessionStage>
  );
}
