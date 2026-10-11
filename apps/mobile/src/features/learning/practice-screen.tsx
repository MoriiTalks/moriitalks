import {
  findLesson,
  learningLessons,
  learningStages,
} from '@content/missions/presentation-foundations';
import type { LessonId } from '@content/missions/presentation-foundations';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ScrollView } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Morii } from '@/components/morii';
import { Screen } from '@/components/screen';
import { Heading, Note } from '@/components/typography';
import { LearningPath } from '@/features/learning/learning-path';
import { useApp } from '@/state/app-context';
import { canStartLesson, nextLesson } from '@/state/progress-model';

// Show the journey first, reveal instruction when its stepping stone is selected.
export function PracticeScreen() {
  const { locale, completedMissionIds, progressStorageStatus } = useApp();
  const [selectedId, setSelectedId] = useState<LessonId | undefined>();
  const scrollRef = useRef<ScrollView>(null);
  const positionedLesson = useRef<LessonId | undefined>(undefined);
  const id = locale === 'id';
  const currentLesson = nextLesson(completedMissionIds);
  const selectedLesson = selectedId ? findLesson(selectedId) : undefined;
  const available = selectedLesson && canStartLesson(selectedLesson.id, completedMissionIds);
  const complete = selectedLesson && completedMissionIds.includes(selectedLesson.id);
  const completedCount = learningLessons.filter((lesson) =>
    completedMissionIds.includes(lesson.id),
  ).length;
  const loading = progressStorageStatus === 'loading';

  return (
    <Screen
      navigation
      scrollRef={scrollRef}
      footer={
        selectedLesson && (
          <View className="gap-3 rounded-[28px] border border-line bg-surface p-4">
            <View className="flex-row items-center gap-3">
              <Text
                accessibilityRole="header"
                className="min-w-0 flex-1 text-xl leading-7 font-semibold text-ink"
              >
                {selectedLesson.locales[locale].title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={id ? 'Tutup detail' : 'Close details'}
                onPress={() => {
                  setSelectedId(undefined);
                }}
                className="size-11 items-center justify-center rounded-full active:bg-mint"
              >
                <Icon name="close" size={20} />
              </Pressable>
            </View>
            <Note>
              {available
                ? selectedLesson.locales[locale].goal
                : id
                  ? 'Coba latihan sebelumnya dulu, lalu kembali ke sini.'
                  : 'Try the previous practice first, then return here.'}
            </Note>
            {available && (
              <Button
                onPress={() => {
                  router.push({ pathname: '/lesson', params: { id: selectedLesson.id } });
                  setSelectedId(undefined);
                }}
              >
                {complete ? (id ? 'Ulangi' : 'Replay') : id ? 'Mulai' : 'Start'}
              </Button>
            )}
          </View>
        )
      }
    >
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <Heading>{id ? 'Latihan' : 'Practice'}</Heading>
        <View
          accessibilityLabel={
            id
              ? `${String(completedCount)} dari ${String(learningLessons.length)} latihan sudah dicoba`
              : `${String(completedCount)} of ${String(learningLessons.length)} practices completed`
          }
          className="min-h-11 flex-row items-center gap-2 rounded-full bg-mint px-4"
        >
          <Icon name="check" size={18} />
          <Text className="text-sm font-semibold text-teal">
            {String(completedCount)} / {String(learningLessons.length)}
          </Text>
        </View>
      </View>
      {loading ? (
        <View className="items-center gap-4 py-12">
          <Morii size={180} />
          <Note>{id ? 'Membuka latihan…' : 'Opening practice…'}</Note>
        </View>
      ) : (
        learningStages.map((stage, index) => {
          const copy = stage.locales[locale];
          return (
            <View
              key={stage.id}
              onLayout={(event) => {
                // Position the current unit once, keep manual scrolling free afterwards.
                if (
                  currentLesson &&
                  positionedLesson.current !== currentLesson.id &&
                  stage.lessons.some((lesson) => lesson.id === currentLesson.id)
                ) {
                  positionedLesson.current = currentLesson.id;
                  scrollRef.current?.scrollTo({
                    y: index === 0 ? 0 : event.nativeEvent.layout.y,
                    animated: false,
                  });
                }
              }}
            >
              <View
                className={`flex-row items-center gap-3 rounded-[24px] px-4 py-4 ${index === 0 ? 'bg-mint' : 'bg-lilac'}`}
              >
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-sm font-medium text-muted">
                    {id ? 'Tahap' : 'Stage'} {String(index + 1)}
                  </Text>
                  <Text
                    accessibilityRole="header"
                    className="text-lg leading-6 font-semibold text-ink"
                  >
                    {copy.title}
                  </Text>
                </View>
                <Morii size={80} pose={index === 0 ? 'wave' : 'explain'} />
              </View>
              <LearningPath
                stage={stage}
                locale={locale}
                completedIds={completedMissionIds}
                currentLessonId={currentLesson?.id}
                selectedLessonId={selectedId}
                onSelect={setSelectedId}
              />
            </View>
          );
        })
      )}
      {!loading && !currentLesson && (
        <Note>
          {id
            ? 'Semua latihan sudah dicoba. Ketuk titik mana pun untuk mengulang.'
            : 'You tried every practice. Tap any stepping stone to replay.'}
        </Note>
      )}
      {progressStorageStatus === 'unavailable' && (
        <Note>
          {id
            ? 'Progres belum tersimpan di perangkat ini. Kamu tetap bisa berlatih.'
            : 'Progress could not be saved on this device. You can still practice.'}
        </Note>
      )}
    </Screen>
  );
}
