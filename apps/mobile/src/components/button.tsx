import type { PropsWithChildren } from 'react';
import { Pressable, Text } from 'react-native';

type ButtonProps = PropsWithChildren<{
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  selected?: boolean;
  expanded?: boolean;
}>;

// Shared actions expose the same disabled, selected, and expanded state on native and web.
export function Button({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  selected,
  expanded,
}: ButtonProps) {
  const secondary = variant === 'secondary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected, expanded }}
      aria-expanded={expanded}
      aria-pressed={selected}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-14 items-center justify-center rounded-2xl px-5 py-4 ${disabled ? 'opacity-50' : 'active:opacity-80'} ${secondary ? 'bg-mint' : 'bg-teal'} ${selected ? 'border-2 border-teal' : ''}`}
    >
      <Text className={`text-center text-base font-bold ${secondary ? 'text-teal' : 'text-white'}`}>
        {children}
      </Text>
    </Pressable>
  );
}
