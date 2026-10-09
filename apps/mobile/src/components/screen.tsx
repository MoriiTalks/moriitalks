import type { PropsWithChildren } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { Navigation } from '@/components/navigation';

const StyledSafeAreaView = withUniwind(SafeAreaView);

export function Screen({
  children,
  navigation = false,
}: PropsWithChildren<{ navigation?: boolean }>) {
  return (
    <StyledSafeAreaView className="flex-1 bg-cream">
      <ScrollView contentContainerClassName="grow p-6">
        <View className="w-full max-w-[560px] gap-6 self-center">{children}</View>
      </ScrollView>
      {navigation && <Navigation />}
    </StyledSafeAreaView>
  );
}
