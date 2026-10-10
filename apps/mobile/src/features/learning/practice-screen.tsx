import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { Morii } from '@/components/morii';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { BackButton } from '@/components/navigation';
import { Eyebrow, Note, Paragraph, Title } from '@/components/typography';
import { firstMission } from '@/features/learning/mission';
import { useApp } from '@/state/app-context';

type PracticeStep = 0 | 1 | 2 | 3;

const actionLabels = {
  0: { id: 'Sekarang giliranku', en: 'My turn' },
  1: { id: 'Aku sudah mencoba', en: 'I’ve tried it' },
  2: { id: 'Sudah mencoba lagi', en: 'I tried again' },
  3: { id: 'Lihat latihan hari ini', en: 'See today’s practice' },
};

const secondaryLabels = {
  0: { id: 'Petunjuk', en: 'Hint' },
  1: { id: 'Contoh', en: 'Example' },
  2: { id: 'Kalimatku', en: 'My sentence' },
  3: { id: 'Beranda', en: 'Home' },
};

// Guides independent practice and records the learner's own report, without capturing or assessing speech.
export function PracticeScreen() {
  const [step, setStep] = useState<PracticeStep>(0);
  const [showHelp, setShowHelp] = useState(false);
  const { locale, completeMission } = useApp();
  const { height } = useWindowDimensions();
  const id = locale === 'id';
  const mission = firstMission.locales[locale];

  function changeStep(nextStep: PracticeStep) {
    setShowHelp(false);
    setStep(nextStep);
  }

  function next() {
    switch (step) {
      case 0:
        changeStep(1);
        break;
      case 1:
        changeStep(2);
        break;
      case 2:
        completeMission(firstMission.id);
        changeStep(3);
        break;
      case 3:
        router.replace('/progress');
        break;
    }
  }

  function secondary() {
    switch (step) {
      case 0:
        setShowHelp(!showHelp);
        break;
      case 1:
        changeStep(0);
        break;
      case 2:
        changeStep(1);
        break;
      case 3:
        router.replace('/');
        break;
    }
  }

  return (
    <Screen footer={<Button onPress={next}>{actionLabels[step][locale]}</Button>}>
      <View className="gap-4">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <BackButton />
          {step < 3 && <Eyebrow>{`${String(step + 1)} / 3`}</Eyebrow>}
          <Pressable
            accessibilityRole="button"
            accessibilityState={step === 0 ? { expanded: showHelp } : {}}
            aria-expanded={step === 0 ? showHelp : undefined}
            onPress={secondary}
            className="min-h-12 justify-center rounded-xl px-3 active:opacity-80"
          >
            <Text className="text-base font-semibold text-teal">
              {showHelp ? (id ? 'Tutup' : 'Close') : secondaryLabels[step][locale]}
            </Text>
          </Pressable>
        </View>
        <Morii pose={step === 1 ? 'listen' : 'wave'} size={height < 740 ? 200 : 270} />
      </View>
      {step === 0 && (
        <>
          <Card>
            <Title>{id ? 'Lihat contoh Morii.' : 'See Morii’s example.'}</Title>
            <Text className="text-2xl leading-[31px] font-semibold text-ink">
              {mission.example}
            </Text>
          </Card>
          {showHelp && <Paragraph>{mission.exampleNote}</Paragraph>}
        </>
      )}
      {step === 1 && (
        <Card>
          <Paragraph>{mission.prompt}</Paragraph>
          <Text className="text-2xl leading-[31px] font-semibold text-ink">{mission.starter}</Text>
          <Note>
            {id ? 'Latihan mandiri, mikrofon mati.' : 'Practice on your own, microphone off.'}
          </Note>
        </Card>
      )}
      {step === 2 && (
        <Card>
          <Title>{id ? 'Satu alasan membantu.' : 'A reason helps.'}</Title>
          <Paragraph>{mission.retry}</Paragraph>
          <Note>
            {id
              ? 'Panduan latihan, bukan penilaian ucapanmu.'
              : 'A practice guide, not a speech assessment.'}
          </Note>
        </Card>
      )}
      {step === 3 && (
        <>
          <Title>{id ? 'Latihanmu sudah dicatat.' : 'Your practice is marked complete.'}</Title>
          <Paragraph>{mission.transfer}</Paragraph>
          <Note>
            {id
              ? 'Dicatat untuk sesi ini, kemampuan berbicara belum dinilai.'
              : 'Saved for this session, speaking skill has not been assessed.'}
          </Note>
        </>
      )}
    </Screen>
  );
}
