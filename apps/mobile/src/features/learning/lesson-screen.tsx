import { findLesson } from '@content/missions/presentation-foundations';
import type { LearningLesson } from '@content/missions/presentation-foundations';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, Text, View } from 'react-native';
import type { ScrollView } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Morii } from '@/components/morii';
import { BackButton } from '@/components/navigation';
import { Screen } from '@/components/screen';
import { Note, Paragraph, Title } from '@/components/typography';
import { useLessonSpeech } from '@/features/learning/use-lesson-speech';
import { useApp } from '@/state/app-context';
import { canStartLesson } from '@/state/progress-model';

type LessonStep = 'baseline' | 'example' | 'task' | 'speak' | 'check' | 'retry' | 'complete';

// A retry returns to the speaking phase instead of suggesting a new lesson or score.
const lessonPhases: Record<LessonStep, number> = {
  baseline: 0,
  example: 0,
  task: 1,
  speak: 2,
  check: 3,
  retry: 2,
  complete: 4,
};

function LessonOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onPress}
      className={`min-h-17 flex-row items-center gap-4 rounded-[24px] border-2 border-b-4 px-5 py-4 active:bg-mint ${selected ? 'border-teal bg-mint' : 'border-line bg-surface'}`}
    >
      <View className="size-5 items-center justify-center rounded-full border-2 border-teal">
        {selected && <View className="size-2.5 rounded-full bg-teal" />}
      </View>
      <Text className="min-w-0 flex-1 text-lg leading-7 font-medium text-ink">{label}</Text>
    </Pressable>
  );
}

// Direct links follow the same unlock rules as the path, malformed IDs cannot select arbitrary content.
export function LessonRoute() {
  const { id: lessonId } = useLocalSearchParams<{ id?: string | string[] }>();
  const { locale, completedMissionIds, progressStorageStatus } = useApp();
  const lesson = typeof lessonId === 'string' ? findLesson(lessonId) : undefined;
  const id = locale === 'id';
  const loading = progressStorageStatus === 'loading';

  if (loading || !lesson || !canStartLesson(lesson.id, completedMissionIds)) {
    return (
      <Screen
        footer={
          <Button
            onPress={() => {
              router.replace('/practice');
            }}
          >
            {id ? 'Ke latihan' : 'Go to practice'}
          </Button>
        }
      >
        <BackButton />
        <Morii size={160} />
        <Title>
          {loading
            ? id
              ? 'Membuka latihan…'
              : 'Opening practice…'
            : lesson
              ? id
                ? 'Mulai dari langkah sebelumnya.'
                : 'Start with the earlier step.'
              : id
                ? 'Latihan ini tidak ditemukan.'
                : 'This lesson could not be found.'}
        </Title>
      </Screen>
    );
  }

  return <LessonScreen key={`${locale}:${lesson.id}`} lesson={lesson} />;
}

// A lesson combines recognition with an independent spoken attempt, only the learner reports completion.
function LessonScreen({ lesson }: { lesson: LearningLesson }) {
  const { locale, completeMission, progressStorageStatus } = useApp();
  const [step, setStep] = useState<LessonStep>(lesson.baseline ? 'baseline' : 'example');
  const [selectedOption, setSelectedOption] = useState<number | undefined>();
  const [selfCheck, setSelfCheck] = useState<'yes' | 'not-yet' | undefined>();
  const [showExampleTip, setShowExampleTip] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const speech = useLessonSpeech(locale);
  const id = locale === 'id';
  const copy = lesson.locales[locale];
  const correct = selectedOption === copy.correctOption;
  const speechActive = speech.state === 'starting' || speech.state === 'speaking';
  const phase = lessonPhases[step];
  const speakingStep = step === 'baseline' || step === 'speak' || step === 'retry';
  const centeredHeader = speakingStep || step === 'complete';

  const headings: Record<LessonStep, string> = {
    baseline: id ? 'Mulai dengan caramu.' : 'Start in your own way.',
    example: copy.title,
    task: copy.question,
    speak: id ? 'Sekarang giliranmu.' : 'Now, your turn.',
    check: copy.selfCheck,
    retry: id ? 'Coba satu bagian lagi.' : 'Try one part again.',
    complete: id ? 'Latihan sudah kamu coba.' : 'You gave the practice a try.',
  };
  const labels: Record<LessonStep, string> = {
    baseline: id ? 'Mulai' : 'Start',
    example: id ? 'Contoh' : 'Example',
    task: id ? 'Pilih' : 'Choose',
    speak: id ? 'Coba' : 'Try',
    check: id ? 'Periksa' : 'Check',
    retry: id ? 'Coba lagi' : 'Try again',
    complete: id ? 'Selesai' : 'Complete',
  };
  const actions: Record<LessonStep, string> = {
    baseline: id ? 'Aku sudah mencoba' : 'I gave it a try',
    example: id ? 'Lanjut' : 'Continue',
    task:
      selectedOption === undefined
        ? id
          ? 'Pilih satu jawaban'
          : 'Choose an answer'
        : !correct
          ? id
            ? 'Coba pilihan lain'
            : 'Try another choice'
          : id
            ? 'Sekarang giliranku'
            : 'My turn',
    speak: id ? 'Aku sudah mencoba' : 'I gave it a try',
    check:
      selfCheck === undefined
        ? id
          ? 'Pilih yang sesuai'
          : 'Choose what fits'
        : selfCheck === 'not-yet'
          ? id
            ? 'Coba satu bagian lagi'
            : 'Try one part again'
          : id
            ? 'Selesai latihan'
            : 'Finish practice',
    retry: id ? 'Sudah mencoba lagi' : 'I tried again',
    complete: id ? 'Kembali ke latihan' : 'Back to practice',
  };

  useEffect(() => {
    // A new instruction starts at the top, optional hints keep the reader's position.
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  function changeStep(next: LessonStep) {
    speech.stop();
    setStep(next);
    // Android and web use the heading's live region, VoiceOver needs an announcement.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(headings[next]);
  }

  function finish() {
    completeMission(lesson.id);
    changeStep('complete');
  }

  function next() {
    switch (step) {
      case 'baseline':
        changeStep('example');
        break;
      case 'example':
        changeStep('task');
        break;
      case 'task':
        if (correct) changeStep('speak');
        break;
      case 'speak':
        changeStep('check');
        break;
      case 'check':
        if (selfCheck === 'yes') finish();
        else if (selfCheck === 'not-yet') changeStep('retry');
        break;
      case 'retry':
        finish();
        break;
      case 'complete':
        router.replace('/practice');
        break;
    }
  }

  return (
    <Screen
      scrollRef={scrollRef}
      footer={
        <Button
          onPress={next}
          disabled={(step === 'task' && !correct) || (step === 'check' && selfCheck === undefined)}
        >
          {actions[step]}
        </Button>
      }
    >
      <View className="flex-row items-center gap-4">
        <BackButton />
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={id ? 'Alur latihan' : 'Lesson progress'}
          accessibilityValue={{
            min: 0,
            max: 4,
            now: phase,
            text: labels[step],
          }}
          className="min-w-0 flex-1 flex-row gap-1.5"
        >
          {[0, 1, 2, 3].map((segment) => (
            <View
              key={segment}
              className={`h-2.5 flex-1 rounded-full ${segment < phase ? 'bg-teal' : segment === phase ? 'bg-mint-strong' : 'bg-line'}`}
            />
          ))}
        </View>
      </View>
      <View className={centeredHeader ? 'items-center gap-4' : 'gap-3'}>
        {centeredHeader && (
          <Morii
            size={176}
            pose={step === 'complete' ? 'encourage' : 'listen'}
            animation={step === 'complete' ? 'encourage' : 'neutral'}
          />
        )}
        {!centeredHeader && (
          <View className="flex-row items-center justify-between gap-3">
            <Text className="min-w-0 flex-1 text-sm font-medium text-teal">{labels[step]}</Text>
            <Morii
              size={64}
              state={speech.state === 'speaking' ? 'speaking' : 'idle'}
              pose="explain"
            />
          </View>
        )}
        <View accessibilityLiveRegion="polite" className="w-full">
          {centeredHeader && (
            <Text className="mb-2 text-sm font-medium text-teal">{labels[step]}</Text>
          )}
          <Title>{headings[step]}</Title>
        </View>
      </View>

      {step === 'example' && (
        <View className="gap-4">
          <Paragraph>{copy.goal}</Paragraph>
          <View className="gap-5 rounded-[28px] border border-line bg-surface p-6">
            <Text className="text-xl leading-8 font-medium text-ink">{copy.example}</Text>
            <Button
              variant="secondary"
              onPress={() => {
                if (speechActive) speech.stop();
                else void speech.play(copy.example);
              }}
            >
              {speechActive
                ? id
                  ? 'Hentikan contoh'
                  : 'Stop example'
                : id
                  ? 'Dengarkan contoh'
                  : 'Listen to example'}
            </Button>
          </View>
          {speech.state === 'unavailable' && (
            <Note>
              {id
                ? 'Suara belum tersedia untuk bahasa ini. Kamu bisa membaca contoh atau mencoba memutarnya lagi.'
                : 'Audio is not available for this language yet. You can read the example or try playing it again.'}
            </Note>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showExampleTip }}
            aria-expanded={showExampleTip}
            onPress={() => {
              setShowExampleTip(!showExampleTip);
            }}
            className="min-h-12 flex-row items-center gap-2.5 self-start rounded-full px-2 active:bg-mint"
          >
            <Icon name="info" size={20} />
            <Text className="text-base font-medium text-teal">
              {showExampleTip
                ? id
                  ? 'Tutup petunjuk'
                  : 'Hide hint'
                : id
                  ? 'Lihat petunjuk'
                  : 'Show hint'}
            </Text>
          </Pressable>
          {showExampleTip && <Paragraph>{copy.exampleNote}</Paragraph>}
        </View>
      )}

      {step === 'task' && (
        <View className="gap-3">
          <View accessibilityRole="radiogroup" accessibilityLabel={copy.question} className="gap-3">
            {copy.options.map((option, index) => (
              <LessonOption
                key={option}
                label={option}
                selected={selectedOption === index}
                onPress={() => {
                  setSelectedOption(index);
                }}
              />
            ))}
          </View>
          {selectedOption !== undefined && (
            <View
              accessibilityLiveRegion="polite"
              className={`flex-row items-start gap-3 rounded-[24px] p-5 ${correct ? 'bg-mint' : 'bg-peach'}`}
            >
              <Icon name={correct ? 'check' : 'info'} />
              <View className="min-w-0 flex-1">
                <Paragraph>{correct ? copy.taskSuccess : copy.taskHint}</Paragraph>
              </View>
            </View>
          )}
          {selectedOption !== undefined && !correct && (
            <Button
              variant="secondary"
              onPress={() => {
                changeStep('example');
              }}
            >
              {id ? 'Lihat contoh lagi' : 'See the example again'}
            </Button>
          )}
        </View>
      )}

      {speakingStep && (
        <View className="gap-4">
          <View className="gap-5 rounded-[28px] border border-line bg-surface p-6">
            <Text className="text-xl leading-8 font-medium text-ink">
              {step === 'retry' ? copy.retry : copy.prompt}
            </Text>
            {step === 'speak' && copy.starter !== '' && (
              <View className="rounded-[20px] bg-mint p-4">
                <Text className="text-lg leading-7 font-medium text-teal">{copy.starter}</Text>
              </View>
            )}
          </View>
          <Note>
            {id
              ? 'Ucapkan dengan lantang. Mikrofon mati, ucapanmu belum dinilai.'
              : 'Speak out loud. The microphone is off, your speech has not been assessed.'}
          </Note>
          {step === 'retry' && (
            <Button variant="secondary" onPress={finish}>
              {id ? 'Cukup untuk sekarang' : 'Enough for now'}
            </Button>
          )}
        </View>
      )}

      {step === 'check' && (
        <View className="gap-4">
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={copy.selfCheck}
            className="gap-3"
          >
            <LessonOption
              label={id ? 'Ya, sudah kucoba' : 'Yes, I tried that'}
              selected={selfCheck === 'yes'}
              onPress={() => {
                setSelfCheck('yes');
              }}
            />
            <LessonOption
              label={id ? 'Aku ingin mencoba lagi' : 'I want to try again'}
              selected={selfCheck === 'not-yet'}
              onPress={() => {
                setSelfCheck('not-yet');
              }}
            />
          </View>
        </View>
      )}

      {step === 'complete' && (
        <View className="gap-4">
          <Paragraph>{copy.transfer}</Paragraph>
          <Note>
            {progressStorageStatus === 'unavailable'
              ? id
                ? 'Selesai menurutmu. Progres belum tersimpan di perangkat ini.'
                : 'Marked complete by you. Progress could not be saved on this device.'
              : progressStorageStatus === 'saving'
                ? id
                  ? 'Selesai menurutmu. Menyimpan progres…'
                  : 'Marked complete by you. Saving progress…'
                : id
                  ? 'Kamu menandai selesai. Ini bukan nilai kemampuan.'
                  : 'Marked complete by you. This is not a skill score.'}
          </Note>
          <Button
            variant="secondary"
            onPress={() => {
              changeStep('retry');
            }}
          >
            {id ? 'Coba sekali lagi' : 'Try once more'}
          </Button>
        </View>
      )}
    </Screen>
  );
}
