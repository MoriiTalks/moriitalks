import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

// Groups related screen content with consistent spacing and surface styling.
export function Card({ children }: PropsWithChildren) {
  return <View className="gap-3 rounded-3xl bg-surface p-5">{children}</View>;
}
