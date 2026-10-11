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
import { LessonExerciseView } from '@/features/learning/lesson-exercise';
import { LessonOption } from '@/features/learning/lesson-option';
import { isSequenceCorrect, toggleSequenceCard } from '@/features/learning/sequence-model';
import { useLessonSpeech } from '@/features/learning/use-lesson-speech';
import { useApp } from '@/state/app-context';
import { canStartLesson } from '@/state/progress-model';

type LessonStep = 'baseline' | 'example' | 'task' | 'speak' | 'check' | 'retry' | 'complete';

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

// Every lesson includes two spoken contexts, preparation checks never act as skill assessments.
function LessonScreen({ lesson }: { lesson: LearningLesson }) {
  const { locale, completeMission, progressStorageStatus } = useApp();
  const [step, setStep] = useState<LessonStep>(lesson.baseline ? 'baseline' : 'example');
  const [selectedOption, setSelectedOption] = useState<number | undefined>();
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [sequenceChecked, setSequenceChecked] = useState(false);
  const [practiceIndex, setPracticeIndex] = useState<0 | 1>(0);
  const [selfCheck, setSelfCheck] = useState<'yes' | 'not-yet' | undefined>();
  const [showExampleTip, setShowExampleTip] = useState(false);
  const [showPracticeHint, setShowPracticeHint] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const speech = useLessonSpeech(locale);
  const id = locale === 'id';
  const copy = lesson.locales[locale];
  const exercise = copy.exercise;
  const practice = copy.practices[practiceIndex];
  const correct =
    exercise.kind === 'choice'
      ? selectedOption === exercise.correctOption
      : exercise.kind === 'sequence' && isSequenceCorrect(selectedCards, exercise.items.length);
  const speechActive = speech.state === 'starting' || speech.state === 'speaking';
  const lessonPhases: Record<LessonStep, number> = {
    baseline: 0,
    example: 0,
    task: 0,
    speak: 1 + practiceIndex * 2,
    check: 2 + practiceIndex * 2,
    retry: 1 + practiceIndex * 2,
    complete: 5,
  };
  const phase = lessonPhases[step];
  const speakingStep = step === 'baseline' || step === 'speak' || step === 'retry';
  const centeredHeader = speakingStep || step === 'complete';

  const headings: Record<LessonStep, string> = {
    baseline: id ? 'Coba sebelum melihat contoh' : 'Try before seeing the example',
    example: copy.title,
    task: exercise.kind === 'speak' ? copy.title : exercise.question,
    speak: id ? 'Praktik berbicara' : 'Speaking practice',
    check: practice.selfCheck,
    retry: id ? 'Coba lagi' : 'Try again',
    complete: id ? 'Latihan selesai' : 'Practice complete',
  };
  const labels: Record<LessonStep, string> = {
    baseline: id ? 'Mulai' : 'Start',
    example: id ? 'Contoh' : 'Example',
    task:
      exercise.kind === 'sequence'
        ? id
          ? 'Susun urutan'
          : 'Put in order'
        : id
          ? 'Pahami contoh'
          : 'Understand the example',
    speak: id
      ? `Praktik ${String(practiceIndex + 1)} dari 2`
      : `Practice ${String(practiceIndex + 1)} of 2`,
    check: id ? 'Periksa' : 'Check',
    retry: id ? 'Coba lagi' : 'Try again',
    complete: id ? 'Selesai' : 'Complete',
  };
  const actions: Record<LessonStep, string> = {
    baseline: id ? 'Aku sudah mencoba' : 'I gave it a try',
    example: id ? 'Lanjut' : 'Continue',
    task:
      exercise.kind === 'sequence'
        ? sequenceChecked
          ? correct
            ? id
              ? 'Mulai praktik'
              : 'Start speaking'
            : id
              ? 'Susun ulang'
              : 'Try another order'
          : selectedCards.length === exercise.items.length
            ? id
              ? 'Periksa urutan'
              : 'Check the order'
            : id
              ? 'Pilih semua kalimat'
              : 'Choose all sentences'
        : selectedOption === undefined
          ? id
            ? 'Pilih satu jawaban'
            : 'Choose an answer'
          : !correct
            ? id
              ? 'Coba pilihan lain'
              : 'Try another choice'
            : id
              ? 'Mulai praktik'
              : 'Start speaking',
    speak: id ? 'Aku sudah mencoba' : 'I gave it a try',
    check:
      selfCheck === undefined
        ? id
          ? 'Pilih yang sesuai'
          : 'Choose what fits'
        : selfCheck === 'not-yet'
          ? id
            ? 'Coba lagi'
            : 'Try again'
          : id
            ? practiceIndex === 0
              ? 'Lanjut praktik'
              : 'Selesai latihan'
            : practiceIndex === 0
              ? 'Next practice'
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

  function advancePractice() {
    if (practiceIndex === 1) {
      finish();
      return;
    }
    setPracticeIndex(1);
    setSelfCheck(undefined);
    setShowPracticeHint(false);
    changeStep('speak');
  }

  function next() {
    switch (step) {
      case 'baseline':
        changeStep('example');
        break;
      case 'example':
        changeStep(exercise.kind === 'speak' ? 'speak' : 'task');
        break;
      case 'task':
        if (exercise.kind === 'sequence' && !sequenceChecked) {
          setSequenceChecked(true);
          break;
        }
        if (exercise.kind === 'sequence' && !correct) {
          setSelectedCards([]);
          setSequenceChecked(false);
          break;
        }
        if (correct) changeStep('speak');
        break;
      case 'speak':
        changeStep('check');
        break;
      case 'check':
        if (selfCheck === 'yes') advancePractice();
        else if (selfCheck === 'not-yet') changeStep('retry');
        break;
      case 'retry':
        advancePractice();
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
          disabled={
            (step === 'task' &&
              (exercise.kind === 'choice'
                ? !correct
                : exercise.kind === 'sequence' &&
                  selectedCards.length !== exercise.items.length)) ||
            (step === 'check' && selfCheck === undefined)
          }
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
            max: 5,
            now: phase,
            text: labels[step],
          }}
          className="min-w-0 flex-1 flex-row gap-1.5"
        >
          {[0, 1, 2, 3, 4].map((segment) => (
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
            size={144}
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
                ? 'Contoh suara belum bisa diputar. Kamu bisa membaca contoh atau mencoba lagi.'
                : 'The voice example could not play. You can read the example or try again.'}
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

      {step === 'task' && exercise.kind !== 'speak' && (
        <View className="gap-3">
          <LessonExerciseView
            exercise={exercise}
            selectedOption={selectedOption}
            onSelectOption={setSelectedOption}
            selectedCards={selectedCards}
            onSelectCard={(index) => {
              setSelectedCards((selection) => toggleSequenceCard(selection, index));
              setSequenceChecked(false);
            }}
            sequenceChecked={sequenceChecked}
            indonesian={id}
          />
          <Button
            variant="secondary"
            onPress={() => {
              changeStep('speak');
            }}
          >
            {id ? 'Langsung praktik' : 'Go straight to speaking'}
          </Button>
        </View>
      )}

      {speakingStep && (
        <View className="gap-4">
          <View className="gap-5 rounded-[28px] border border-line bg-surface p-6">
            <Text className="text-xl leading-8 font-medium text-ink">{practice.prompt}</Text>
            {step === 'retry' && <Paragraph>{copy.retry}</Paragraph>}
            {step !== 'baseline' && practice.starter !== '' && (
              <Button
                variant="secondary"
                expanded={showPracticeHint}
                onPress={() => {
                  setShowPracticeHint(!showPracticeHint);
                }}
              >
                {showPracticeHint
                  ? id
                    ? 'Tutup bantuan'
                    : 'Hide help'
                  : id
                    ? 'Lihat bantuan'
                    : 'Show help'}
              </Button>
            )}
            {step !== 'baseline' && showPracticeHint && practice.starter !== '' && (
              <View className="rounded-[20px] bg-mint p-4">
                <Text className="text-lg leading-7 font-medium text-teal">{practice.starter}</Text>
              </View>
            )}
          </View>
          <Note>
            {id
              ? 'Ucapkan dengan suara yang nyaman. Praktik ini tidak direkam atau dinilai.'
              : 'Speak at a comfortable volume. This practice is not recorded or assessed.'}
          </Note>
          {step === 'retry' && (
            <Button variant="secondary" onPress={advancePractice}>
              {id
                ? practiceIndex === 0
                  ? 'Lanjut praktik'
                  : 'Selesai latihan'
                : practiceIndex === 0
                  ? 'Next practice'
                  : 'Finish practice'}
            </Button>
          )}
        </View>
      )}

      {step === 'check' && (
        <View className="gap-4">
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={practice.selfCheck}
            className="gap-3"
          >
            <LessonOption
              label={id ? 'Ya, sudah saya coba' : 'Yes, I tried that'}
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
                ? 'Catatan latihan belum tersimpan di perangkat ini.'
                : 'Your practice record could not be saved on this device.'
              : progressStorageStatus === 'saving'
                ? id
                  ? 'Menyimpan catatan latihan…'
                  : 'Saving your practice record…'
                : id
                  ? 'Ini catatan praktik, bukan penilaian kemampuan.'
                  : 'This is a practice record, not a skill assessment.'}
          </Note>
          <Button
            variant="secondary"
            onPress={() => {
              // A fresh replay includes both contexts before another completion is reported.
              setPracticeIndex(0);
              setSelfCheck(undefined);
              setShowPracticeHint(false);
              changeStep('speak');
            }}
          >
            {id ? 'Ulangi praktik' : 'Repeat speaking practice'}
          </Button>
        </View>
      )}
    </Screen>
  );
}
