import { Pressable, Text, View } from 'react-native';

// Shared radio options expose selection without depending on color alone.
export function LessonOption({
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
      className={`min-h-17 flex-row items-center gap-4 rounded-3xl border-2 border-b-4 px-5 py-4 active:bg-mint ${selected ? 'border-teal bg-mint' : 'border-line bg-surface'}`}
    >
      <View className="size-5 items-center justify-center rounded-full border-2 border-teal">
        {selected && <View className="size-2.5 rounded-full bg-teal" />}
      </View>
      <Text className="min-w-0 flex-1 text-lg leading-7 font-medium text-ink">{label}</Text>
    </Pressable>
  );
}
