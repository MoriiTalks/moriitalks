import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { VoiceMode, VoiceTopic } from '@contracts/voice';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { Sheet } from '@/components/sheet';
import { Eyebrow, Note, Paragraph } from '@/components/typography';
import { useApp } from '@/state/app-context';

import { harnessCopy } from './harness-copy';
import { HarnessPanelView, HarnessTools } from './harness-panel';
import { sessionCopy } from './session-copy';
import { SessionStage } from './session-stage';
import { useVoiceSession } from './use-voice-session';

// Cloud testing requires adult opt-in, every microphone capture still needs a separate press.
export function VoiceLabScreen() {
  const { locale } = useApp();
  const copy = sessionCopy[locale];
  const harness = harnessCopy[locale];
  const [topic, setTopic] = useState<VoiceTopic>('hobby');
  const [mode, setMode] = useState<VoiceMode>('talk');
  const [sheet, setSheet] = useState<'setup' | 'details' | null>(null);
  const [showTools, setShowTools] = useState(false);
  const session = useVoiceSession({ locale, mode, topic });
  const live = session.kind === 'live';
  const busy = session.status === 'connecting' || session.status === 'thinking';
  const listening = session.status === 'listening';
  const speaking = session.status === 'speaking';
  const canReopen = ['idle', 'paused', 'ended', 'error'].includes(session.status);
  const exhausted = live && session.remainingTurns === 0 && session.status === 'ready';
  const actionable =
    live && session.status === 'ready' && session.responseId !== null && !exhausted;

  function pressPrimary() {
    if (exhausted) {
      session.end();
    } else if (speaking) {
      session.interrupt();
    } else if (listening) {
      void session.commitTurn();
    } else if (canReopen) {
      setSheet(null);
      setShowTools(false);
      void session.startLive();
    } else {
      setShowTools(false);
      void session.startTurn();
    }
  }

  const primaryLabel = exhausted
    ? copy.end
    : busy
      ? copy.wait
      : speaking
        ? copy.interrupt
        : listening
          ? copy.send
          : canReopen
            ? copy.consent
            : copy.record;
  const topics = [
    { value: 'hobby', label: copy.topics.hobby },
    { value: 'day', label: copy.topics.day },
    { value: 'ideas', label: harness.ideas },
  ] satisfies { value: VoiceTopic; label: string }[];

  return (
    <>
      <SessionStage
        status={copy.status[session.status]}
        state={session.status}
        animation={session.animation}
        prop={
          session.panel?.type === 'show_hint' || session.panel?.type === 'show_outline'
            ? 'idea-card'
            : 'none'
        }
        quiet={(session.panel !== null && !speaking) || sheet !== null || showTools}
        info={{ title: copy.lab, body: copy.labNote }}
        {...(!canReopen ? { onEnd: session.end } : {})}
        footer={
          canReopen ? (
            <>
              <Note>{copy.labNote}</Note>
              <Button disabled={busy} onPress={pressPrimary}>
                {primaryLabel}
              </Button>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSheet('setup');
                }}
                className="min-h-12 flex-row items-center justify-center gap-2 rounded-full px-3"
              >
                <Icon name="settings" size={18} />
                <Text className="text-sm text-muted">{harness.setup}</Text>
              </Pressable>
            </>
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
              <View className="flex-row items-center justify-center gap-6">
                <View className="size-12" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={primaryLabel}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={pressPrimary}
                  className={`size-18 items-center justify-center rounded-full ${listening ? 'bg-peach' : 'bg-teal'} ${busy ? 'opacity-40' : 'active:opacity-75'}`}
                >
                  <Icon
                    name={exhausted ? 'close' : speaking ? 'pause' : listening ? 'check' : 'mic'}
                    size={28}
                    color={listening ? '#183D37' : '#FFFFFF'}
                  />
                </Pressable>
                <IconButton
                  icon="more"
                  label={harness.details}
                  disabled={listening}
                  onPress={() => {
                    setSheet('details');
                  }}
                />
              </View>
              <Text className="text-center text-sm leading-5 text-muted">{primaryLabel}</Text>
            </>
          )
        }
      >
        {live && session.panel !== null && (
          <HarnessPanelView
            panel={session.panel}
            locale={locale}
            disabled={!actionable}
            canEnd={session.status === 'ready'}
            busy={busy || listening || speaking}
            onAction={session.act}
            onDismiss={session.dismissPanel}
          />
        )}
        {session.error !== null && <Note>{session.error}</Note>}
      </SessionStage>
      <Sheet
        visible={sheet === 'setup' && canReopen}
        title={harness.setup}
        closeLabel={harness.close}
        onClose={() => {
          setSheet(null);
        }}
      >
        <Button
          variant="secondary"
          onPress={() => {
            setSheet(null);
            session.end();
            router.push('/device-check');
          }}
        >
          {locale === 'id' ? 'Periksa audio perangkat' : 'Check device audio'}
        </Button>
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button
              selected={mode === 'practice'}
              variant="secondary"
              onPress={() => {
                setMode('practice');
              }}
            >
              {copy.modes.practice}
            </Button>
          </View>
          <View className="flex-1">
            <Button
              selected={mode === 'talk'}
              variant="secondary"
              onPress={() => {
                setMode('talk');
              }}
            >
              {copy.modes.talk}
            </Button>
          </View>
        </View>
        {topics.map((item) => (
          <Button
            key={item.value}
            selected={topic === item.value}
            variant="secondary"
            onPress={() => {
              setTopic(item.value);
            }}
          >
            {item.label}
          </Button>
        ))}
      </Sheet>
      <Sheet
        visible={sheet === 'details' && live && !canReopen}
        title={harness.details}
        closeLabel={harness.close}
        onClose={() => {
          setSheet(null);
        }}
      >
        {session.response !== '' && (
          <>
            <Eyebrow>{harness.response}</Eyebrow>
            <Paragraph>{session.response}</Paragraph>
          </>
        )}
        {session.transcript !== '' && (
          <>
            <Eyebrow>{copy.heard}</Eyebrow>
            <Paragraph>{session.transcript}</Paragraph>
          </>
        )}
        <Note>
          {copy.remaining}: {session.remainingTurns}
        </Note>
        {session.firstResponseMs !== null && (
          <Note>
            {copy.latency}: {session.firstResponseMs} ms
          </Note>
        )}
        {session.metrics !== null && (
          <>
            <Note>
              STT / AI / TTS: {session.metrics.sttMs} / {session.metrics.coachMs} /{' '}
              {session.metrics.ttsMs} ms
            </Note>
            <Note>
              {copy.audio}: {session.metrics.audioSeconds.toFixed(1)} s · {copy.tokens}:{' '}
              {session.metrics.inputTokens} / {session.metrics.outputTokens} · {copy.characters}:{' '}
              {session.metrics.ttsCharacters}
            </Note>
          </>
        )}
      </Sheet>
    </>
  );
}
