import type { PropsWithChildren } from 'react';
import { Pressable, Text } from 'react-native';

type ButtonProps = PropsWithChildren<{
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}>;

export function Button({ children, onPress, variant = 'primary' }: ButtonProps) {
  const secondary = variant === 'secondary';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-14 items-center justify-center rounded-2xl px-5 py-4 active:opacity-80 ${secondary ? 'bg-mint' : 'bg-teal'}`}
    >
      <Text className={`text-center text-base font-bold ${secondary ? 'text-teal' : 'text-white'}`}>
        {children}
      </Text>
    </Pressable>
  );
}
