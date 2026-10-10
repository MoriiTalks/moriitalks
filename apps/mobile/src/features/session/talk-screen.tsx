import { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Morii } from '@/components/morii';
import { BackButton } from '@/components/navigation';
import { Screen } from '@/components/screen';
import { Eyebrow, Paragraph, Title } from '@/components/typography';
import { useApp } from '@/state/app-context';

import { sessionCopy } from './session-copy';
import { useVoiceSession } from './use-voice-session';
import { previewExample } from './voice-runtime';
import type { PreviewExample } from './voice-runtime';

// Runs scripted conversation examples without microphone capture or cloud requests.
export function TalkScreen() {
  const { locale } = useApp();
  const { height, width } = useWindowDimensions();
  const [step, setStep] = useState<'prompt' | 'example' | 'feedback'>('prompt');
  const [exampleKind, setExampleKind] = useState<PreviewExample>('reason');
  const [showTranscript, setShowTranscript] = useState(false);
  const session = useVoiceSession({ locale, mode: 'practice', topic: 'hobby' });
  const copy = sessionCopy[locale];
  const example = previewExample(locale, exampleKind);
  const speaking = session.status === 'speaking';
  const moriiSize = Math.min(height < 740 ? 200 : 280, width - 64);

  function pressPrimary() {
    if (speaking) {
      session.interrupt();
    } else if (step === 'example') {
      setStep('feedback');
      void session.startPreview(exampleKind);
    } else {
      if (step === 'feedback') {
        session.interrupt();
        setExampleKind((current) => (current === 'reason' ? 'brief' : 'reason'));
      }
      setShowTranscript(false);
      setStep('example');
    }
  }

  const primaryLabel = speaking
    ? copy.interrupt
    : step === 'example'
      ? copy.showFeedback
      : step === 'feedback'
        ? copy.nextExample
        : copy.showExample;

  return (
    <Screen footer={<Button onPress={pressPrimary}>{primaryLabel}</Button>}>
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <BackButton />
        <Title>{copy.title}</Title>
      </View>
      <View className="gap-3">
        <Morii size={moriiSize} />
        <Text
          accessibilityLiveRegion="polite"
          className="text-center text-sm leading-5 font-semibold text-teal"
        >
          {speaking ? copy.status.speaking : copy.preview}
        </Text>
      </View>
      <Card>
        {step === 'example' && <Eyebrow>{copy.sample}</Eyebrow>}
        <Paragraph>
          {step === 'prompt'
            ? copy.prompts.hobby
            : step === 'example'
              ? example.transcript
              : session.response || example.response}
        </Paragraph>
        {step === 'feedback' && (
          <>
            <Button
              expanded={showTranscript}
              variant="secondary"
              onPress={() => {
                setShowTranscript((shown) => !shown);
              }}
            >
              {showTranscript ? copy.hideExample : copy.showExample}
            </Button>
            {showTranscript && (
              <View className="gap-2">
                <Eyebrow>{copy.sample}</Eyebrow>
                <Paragraph>{example.transcript}</Paragraph>
              </View>
            )}
          </>
        )}
      </Card>
    </Screen>
  );
}
