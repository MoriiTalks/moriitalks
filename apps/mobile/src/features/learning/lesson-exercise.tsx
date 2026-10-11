import type { ChoiceExercise, SequenceExercise } from '@content/missions/learning-types';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Note, Paragraph } from '@/components/typography';
import { LessonOption } from '@/features/learning/lesson-option';
import { isSequenceCorrect } from '@/features/learning/sequence-model';

// Preparation checks stay separate from the learner's spoken attempts and completion record.
export function LessonExerciseView({
  exercise,
  selectedOption,
  onSelectOption,
  selectedCards,
  onSelectCard,
  sequenceChecked,
  indonesian,
}: {
  exercise: ChoiceExercise | SequenceExercise;
  selectedOption: number | undefined;
  onSelectOption: (index: number) => void;
  selectedCards: readonly number[];
  onSelectCard: (index: number) => void;
  sequenceChecked: boolean;
  indonesian: boolean;
}) {
  const checked = exercise.kind === 'choice' ? selectedOption !== undefined : sequenceChecked;
  const correct =
    exercise.kind === 'choice'
      ? selectedOption === exercise.correctOption
      : isSequenceCorrect(selectedCards, exercise.items.length);

  return (
    <View className="gap-4">
      {exercise.kind === 'choice' ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={exercise.question}
          className="gap-3"
        >
          {exercise.options.map((option, index) => (
            <LessonOption
              key={option}
              label={option}
              selected={selectedOption === index}
              onPress={() => {
                onSelectOption(index);
              }}
            />
          ))}
        </View>
      ) : (
        <View className="gap-3">
          <Note>
            {indonesian
              ? 'Ketuk kalimat sesuai urutan. Ketuk lagi untuk membatalkan pilihan.'
              : 'Tap the sentences in order. Tap a selected sentence to remove it.'}
          </Note>
          {[...exercise.items.slice(1), exercise.items[0]].map((item, position) => {
            // Rotate the cards consistently, keep their positions stable while selecting.
            const index = (position + 1) % exercise.items.length;
            const selectedPosition = selectedCards.indexOf(index);
            const selected = selectedPosition !== -1;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityLabel={
                  selected
                    ? `${indonesian ? 'Urutan' : 'Position'} ${String(selectedPosition + 1)}. ${item}`
                    : item
                }
                accessibilityHint={
                  selected
                    ? indonesian
                      ? 'Ketuk untuk membatalkan'
                      : 'Tap to remove'
                    : indonesian
                      ? 'Tambahkan ke urutan'
                      : 'Add to the sequence'
                }
                accessibilityState={{ selected }}
                aria-pressed={selected}
                onPress={() => {
                  onSelectCard(index);
                }}
                className={`min-h-17 flex-row items-center gap-4 rounded-3xl border-2 border-b-4 px-5 py-4 active:bg-mint ${selected ? 'border-teal bg-mint' : 'border-line bg-surface'}`}
              >
                <View className="size-8 items-center justify-center rounded-full bg-mint-strong">
                  {selected ? (
                    <Text className="text-base font-semibold text-teal">
                      {String(selectedPosition + 1)}
                    </Text>
                  ) : (
                    <Icon name="more" size={18} />
                  )}
                </View>
                <Text className="min-w-0 flex-1 text-lg leading-7 font-medium text-ink">
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {checked && (
        <View
          accessibilityLiveRegion="polite"
          className={`flex-row items-start gap-3 rounded-3xl p-5 ${correct ? 'bg-mint' : 'bg-peach'}`}
        >
          <Icon name={correct ? 'check' : 'info'} />
          <View className="min-w-0 flex-1">
            <Paragraph>{correct ? exercise.success : exercise.hint}</Paragraph>
          </View>
        </View>
      )}
    </View>
  );
}
