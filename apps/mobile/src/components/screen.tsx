import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { Navigation } from '@/components/navigation';
import { SceneBackground } from '@/components/scene-background';

const StyledSafeAreaView = withUniwind(SafeAreaView);

// Keeps optional actions and navigation outside the scrolling, width-limited content.
export function Screen({
  children,
  navigation = false,
  footer,
}: PropsWithChildren<{ navigation?: boolean; footer?: ReactNode }>) {
  return (
    <StyledSafeAreaView className="flex-1 bg-cream">
      <SceneBackground />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="grow px-6 pt-5 pb-3"
      >
        <View className="min-h-0 w-full max-w-140 flex-1 gap-6 self-center">{children}</View>
      </ScrollView>
      {footer !== undefined && (
        <View className="px-6 pt-3 pb-6">
          <View className="w-full max-w-140 self-center">{footer}</View>
        </View>
      )}
      {navigation && <Navigation />}
    </StyledSafeAreaView>
  );
}
