import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

export function Card({ children }: PropsWithChildren) {
  return <View className="gap-4 rounded-3xl border border-line bg-white p-6">{children}</View>;
}
