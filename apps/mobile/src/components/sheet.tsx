import type { PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { IconButton } from './icon-button';

const StyledSafeAreaView = withUniwind(SafeAreaView);

// Optional details share one dismissible sheet with overflow support for larger text.
export function Sheet({
  children,
  visible,
  title,
  closeLabel,
  onClose,
}: PropsWithChildren<{
  visible: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
}>) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/20">
        <Pressable
          className="flex-1"
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
        />
        <StyledSafeAreaView
          edges={['bottom']}
          accessibilityViewIsModal
          className="max-h-[75%] w-full max-w-140 self-center rounded-t-4xl bg-surface"
        >
          <View className="min-h-0 shrink px-6 pt-4">
            <View className="flex-row items-center justify-between gap-3">
              <Text accessibilityRole="header" className="flex-1 text-lg font-semibold text-ink">
                {title}
              </Text>
              <IconButton icon="close" label={closeLabel} onPress={onClose} />
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerClassName="gap-3 pt-2 pb-8"
            >
              {children}
            </ScrollView>
          </View>
        </StyledSafeAreaView>
      </View>
    </Modal>
  );
}
