import { useState } from 'react';
import { Text, View } from 'react-native';
import type { VoiceMode } from '@contracts/voice';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Morii } from '@/components/morii';
import { BackButton } from '@/components/navigation';
import { Screen } from '@/components/screen';
import { Eyebrow, Heading, Note, Paragraph } from '@/components/typography';
import { useApp } from '@/state/app-context';

import { sessionCopy } from './session-copy';
import { useVoiceSession } from './use-voice-session';

// Adult opt-in entry point for cloud voice testing, separate from scripted practice.
export function VoiceLabScreen() {
  const { locale } = useApp();
  const copy = sessionCopy[locale];
  const [topic, setTopic] = useState<keyof typeof copy.topics>('hobby');
  const [mode, setMode] = useState<VoiceMode>('talk');
  const [showTranscript, setShowTranscript] = useState(false);
  const session = useVoiceSession({ locale, mode, topic });
  const live = session.kind === 'live';
  const busy = session.status === 'connecting' || session.status === 'thinking';
  const listening = session.status === 'listening';
  const speaking = session.status === 'speaking';
  const canReopen =
    session.status === 'idle' ||
    session.status === 'paused' ||
    session.status === 'ended' ||
    session.status === 'error';
  const active = !canReopen;
  const exhausted = live && session.remainingTurns === 0 && session.status === 'ready';

  function pressPrimary() {
    if (exhausted) {
      session.end();
    } else if (speaking) {
      session.interrupt();
    } else if (listening) {
      void session.commitTurn();
    } else if (canReopen) {
      // Adult confirmation connects a session, a later press requests microphone capture.
      setShowTranscript(false);
      void session.startLive();
    } else {
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

  return (
    <Screen
      footer={
        <View className="gap-3">
          <Button disabled={busy} onPress={pressPrimary}>
            {primaryLabel}
          </Button>
          {active && !exhausted && (
            <Button variant="secondary" onPress={session.end}>
              {copy.end}
            </Button>
          )}
        </View>
      }
    >
      <BackButton />
      <Heading>{copy.lab}</Heading>
      <Note>{copy.labNote}</Note>
      <Card>
        <Eyebrow>{copy.labTitle}</Eyebrow>
        <View className="gap-3">
          <Button
            selected={mode === 'practice'}
            disabled={active}
            variant="secondary"
            onPress={() => {
              setMode('practice');
            }}
          >
            {copy.modes.practice}
          </Button>
          <Button
            selected={mode === 'talk'}
            disabled={active}
            variant="secondary"
            onPress={() => {
              setMode('talk');
            }}
          >
            {copy.modes.talk}
          </Button>
        </View>
        <View className="gap-3">
          <Button
            selected={topic === 'hobby'}
            disabled={active}
            variant="secondary"
            onPress={() => {
              setTopic('hobby');
            }}
          >
            {copy.topics.hobby}
          </Button>
          <Button
            selected={topic === 'day'}
            disabled={active}
            variant="secondary"
            onPress={() => {
              setTopic('day');
            }}
          >
            {copy.topics.day}
          </Button>
        </View>
      </Card>
      {live && (
        <>
          <View className="gap-2">
            <Morii pose={listening ? 'listen' : 'wave'} size={220} />
            <Text
              accessibilityLiveRegion="polite"
              className="text-center text-sm leading-5 font-semibold text-teal"
            >
              {copy.status[session.status]}
            </Text>
          </View>
          <Card>
            <Eyebrow>{copy.response}</Eyebrow>
            <Paragraph>{session.response || copy.prompts[topic]}</Paragraph>
            {session.transcript !== '' && (
              <>
                <Button
                  expanded={showTranscript}
                  variant="secondary"
                  onPress={() => {
                    setShowTranscript((shown) => !shown);
                  }}
                >
                  {showTranscript ? copy.hideTranscript : copy.showTranscript}
                </Button>
                {showTranscript && (
                  <View className="gap-2">
                    <Eyebrow>{copy.heard}</Eyebrow>
                    <Paragraph>{session.transcript}</Paragraph>
                  </View>
                )}
              </>
            )}
          </Card>
          <View className="gap-2">
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
                  {session.metrics.inputTokens} / {session.metrics.outputTokens} · {copy.characters}
                  : {session.metrics.ttsCharacters}
                </Note>
              </>
            )}
          </View>
        </>
      )}
      {session.error !== null && <Note>{session.error}</Note>}
    </Screen>
  );
}
