import { learningLessons } from '@content/missions/presentation-foundations';
import type {
  LearningLocale,
  LearningStage,
  LessonId,
} from '@content/missions/presentation-foundations';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon';
import { canStartLesson } from '@/state/progress-model';

const horizontalPositions = [
  { x: 160, left: '50%' },
  { x: 100, left: '31.25%' },
  { x: 160, left: '50%' },
  { x: 220, left: '68.75%' },
] as const;
const lessonIcons = ['chat', 'sparkles', 'practice', 'mic'] satisfies readonly IconName[];

interface PathPoint {
  x: number;
  y: number;
}

function curve(points: readonly PathPoint[]): string {
  return points.reduce((path, point, index) => {
    const previous = points[index - 1];
    if (!previous) return `M ${String(point.x)} ${String(point.y)}`;
    const middle = (previous.y + point.y) / 2;
    return `${path} C ${String(previous.x)} ${String(middle)}, ${String(point.x)} ${String(middle)}, ${String(point.x)} ${String(point.y)}`;
  }, '');
}

// The path shares unlock rules with direct links, decoration never awards progress.
export function LearningPath({
  stage,
  locale,
  completedIds,
  currentLessonId,
  selectedLessonId,
  onSelect,
}: {
  stage: LearningStage;
  locale: LearningLocale;
  completedIds: readonly string[];
  currentLessonId: LessonId | undefined;
  selectedLessonId: LessonId | undefined;
  onSelect: (lessonId: LessonId) => void;
}) {
  const [cueHeight, setCueHeight] = useState(56);
  const currentIndex = stage.lessons.findIndex((lesson) => lesson.id === currentLessonId);
  const cueSpace = currentIndex === -1 ? 0 : cueHeight + 8;
  // Reserve measured space for the current cue, including enlarged system text.
  const points = stage.lessons.map((_, index) => ({
    ...(horizontalPositions[index] ?? horizontalPositions[0]),
    y: 64 + index * 112 + (currentIndex !== -1 && index > currentIndex ? cueSpace : 0),
  }));
  const height = stage.lessons.length * 112 + 32 + cueSpace;
  const completedCount = stage.lessons.filter((lesson) => completedIds.includes(lesson.id)).length;
  const decoration = Platform.OS === 'web' ? { 'aria-hidden': true } : { accessible: false };

  return (
    <View className="w-full max-w-80 self-center" style={{ height }}>
      <View pointerEvents="none" className="absolute inset-0">
        <Svg
          width="100%"
          height={height}
          viewBox={`0 0 320 ${String(height)}`}
          preserveAspectRatio="none"
          {...decoration}
        >
          <Path
            d={curve(points)}
            fill="none"
            stroke="#DEE8E0"
            strokeWidth={5}
            strokeDasharray="2 14"
            strokeLinecap="round"
          />
          {completedCount > 1 && (
            <Path
              d={curve(points.slice(0, completedCount))}
              fill="none"
              stroke="#176B61"
              strokeWidth={4}
              strokeLinecap="round"
            />
          )}
        </Svg>
      </View>
      {stage.lessons.map((lesson, index) => {
        const point = points[index];
        if (!point) return null;
        const complete = completedIds.includes(lesson.id);
        const available = canStartLesson(lesson.id, completedIds);
        const current = lesson.id === currentLessonId;
        const selected = lesson.id === selectedLessonId;
        const status = complete
          ? locale === 'id'
            ? 'Sudah dicoba, boleh diulang'
            : 'Practiced, replay available'
          : available
            ? locale === 'id'
              ? 'Latihan berikutnya'
              : 'Next practice'
            : locale === 'id'
              ? 'Terbuka setelah latihan sebelumnya'
              : 'Opens after the previous practice';

        return (
          <Pressable
            key={lesson.id}
            accessibilityRole="button"
            accessibilityLabel={`${lesson.locales[locale].title}. ${status}`}
            accessibilityHint={locale === 'id' ? 'Lihat detail latihan' : 'View practice details'}
            accessibilityState={{ selected }}
            aria-pressed={selected}
            onPress={() => {
              onSelect(lesson.id);
            }}
            className={`absolute items-center active:translate-y-1 ${current ? 'w-full' : 'h-22 w-24 justify-center'}`}
            style={
              current
                ? { left: 0, top: point.y - 44 }
                : { left: point.left, top: point.y - 44, marginLeft: -48 }
            }
          >
            <View
              className={`h-22 w-24 items-center justify-center rounded-full border-2 ${current || selected ? 'border-teal' : 'border-transparent'}`}
              style={
                current ? { alignSelf: 'flex-start', left: point.left, marginLeft: -48 } : undefined
              }
            >
              <View
                className={`h-17 w-19 items-center justify-center rounded-full border-b-[6px] ${available ? 'border-teal-strong bg-teal' : 'border-line bg-mint'}`}
              >
                <Icon
                  name={complete ? 'check' : (lessonIcons[index] ?? 'practice')}
                  color={available ? '#FFFFFF' : '#5C7068'}
                  size={30}
                />
              </View>
              {!available && (
                <View className="absolute right-0 bottom-1 size-6 items-center justify-center rounded-full border border-line bg-surface">
                  <Icon name="lock" size={13} color="#5C7068" />
                </View>
              )}
            </View>
            {current && (
              <View
                onLayout={(event) => {
                  setCueHeight(event.nativeEvent.layout.height);
                }}
                className="mt-2 w-full items-center gap-1 px-2"
              >
                <Text className="text-center text-base leading-6 font-semibold text-ink">
                  {lesson.locales[locale].title}
                </Text>
                <Text className="text-center text-sm leading-5 font-medium text-teal">
                  {lesson.id === learningLessons[0]?.id
                    ? locale === 'id'
                      ? 'Ketuk untuk mulai'
                      : 'Tap to start'
                    : locale === 'id'
                      ? 'Ketuk untuk lanjut'
                      : 'Tap to continue'}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
