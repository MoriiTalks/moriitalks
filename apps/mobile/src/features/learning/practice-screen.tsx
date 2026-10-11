import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { Morii } from '@/components/morii';
import { Button } from '@/components/button';
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
  const [moriiSize, setMoriiSize] = useState(270);
  const { height } = useWindowDimensions();
  const { locale, completeMission } = useApp();
  const id = locale === 'id';
  const mission = firstMission.locales[locale];
  // Leave room for the example on short screens while keeping text at its readable size.
  const maximumMoriiSize = height > 0 ? Math.max(140, height * 0.32) : 270;

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
      <View
        className="gap-5"
        onLayout={(event) => {
          setMoriiSize(Math.max(140, Math.min(event.nativeEvent.layout.width - 24, 270)));
        }}
      >
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <BackButton />
          {step < 3 && <Eyebrow>{`${String(step + 1)} / 3`}</Eyebrow>}
          <Pressable
            accessibilityRole="button"
            accessibilityState={step === 0 ? { expanded: showHelp } : {}}
            aria-expanded={step === 0 ? showHelp : undefined}
            onPress={secondary}
            className="min-h-12 justify-center rounded-full px-3 active:bg-mint"
          >
            <Text className="text-sm font-medium text-teal">
              {showHelp ? (id ? 'Tutup' : 'Close') : secondaryLabels[step][locale]}
            </Text>
          </Pressable>
        </View>
        <Morii
          pose={step === 1 ? 'listen' : 'wave'}
          animation={step === 3 ? 'encourage' : 'neutral'}
          size={Math.min(moriiSize, maximumMoriiSize)}
        />
      </View>
      {step === 0 && (
        <View className="items-center gap-4">
          <Eyebrow>{id ? 'Contoh Morii' : 'Morii’s example'}</Eyebrow>
          <View className="w-full rounded-[28px] bg-surface p-5">
            <Text className="text-center text-xl leading-8 font-medium text-ink">
              {mission.example}
            </Text>
          </View>
          {showHelp && <Paragraph>{mission.exampleNote}</Paragraph>}
        </View>
      )}
      {step === 1 && (
        <View className="items-center gap-4">
          <Title>{id ? 'Sekarang ceritamu.' : 'Now, your story.'}</Title>
          <Text className="text-center text-lg leading-7 text-muted">{mission.prompt}</Text>
          <View className="w-full rounded-[28px] bg-mist px-5 py-4">
            <Text className="text-center text-xl leading-8 font-medium text-ink">
              {mission.starter}
            </Text>
          </View>
          <Note>
            {id ? 'Latihan mandiri · mikrofon mati' : 'Practice on your own · microphone off'}
          </Note>
        </View>
      )}
      {step === 2 && (
        <View className="items-center gap-4">
          <Title>{id ? 'Satu ide. Satu alasan.' : 'One idea. One reason.'}</Title>
          <Text className="text-center text-lg leading-7 text-muted">{mission.retry}</Text>
          <Note>
            {id ? 'Panduan latihan, bukan penilaian.' : 'A practice guide, not an assessment.'}
          </Note>
        </View>
      )}
      {step === 3 && (
        <View className="items-center gap-4">
          <Title>{id ? 'Sudah kamu coba.' : 'You gave it a try.'}</Title>
          <Text className="text-center text-lg leading-7 text-muted">{mission.transfer}</Text>
          <Note>
            {id
              ? 'Selesai menurutmu, dicatat untuk sesi ini. Kemampuan belum dinilai.'
              : 'Marked complete by you, saved for this session. Skill has not been assessed.'}
          </Note>
        </View>
      )}
    </Screen>
  );
}
