import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { Navigation } from '@/components/navigation';

const StyledSafeAreaView = withUniwind(SafeAreaView);

// Keeps optional actions and navigation outside the scrolling, width-limited content.
export function Screen({
  children,
  navigation = false,
  footer,
}: PropsWithChildren<{ navigation?: boolean; footer?: ReactNode }>) {
  return (
    <StyledSafeAreaView className="flex-1 bg-cream">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="grow p-6">
        <View className="w-full max-w-[560px] gap-6 self-center">{children}</View>
      </ScrollView>
      {footer !== undefined && (
        <View className="px-6 pt-3 pb-6">
          <View className="w-full max-w-[560px] self-center">{footer}</View>
        </View>
      )}
      {navigation && <Navigation />}
    </StyledSafeAreaView>
  );
}
