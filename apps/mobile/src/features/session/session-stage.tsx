import { router } from 'expo-router';
import { Children, useState, useSyncExternalStore } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import type { ScaledSize } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { Button } from '@/components/button';
import { IconButton } from '@/components/icon-button';
import { Morii } from '@/components/morii';
import type { MoriiAnimation, MoriiState } from '@/components/morii';
import { SceneBackground } from '@/components/scene-background';
import { Sheet } from '@/components/sheet';
import { useApp } from '@/state/app-context';

const StyledSafeAreaView = withUniwind(SafeAreaView);

const serverViewport: ScaledSize = { width: 0, height: 0, scale: 1, fontScale: 1 };
const windowSnapshot = () => Dimensions.get('window');
const serverWindowSnapshot = () => serverViewport;

function subscribeWindow(changed: () => void) {
  const listener = Dimensions.addEventListener('change', changed);
  return () => {
    listener.remove();
  };
}

// Morii keeps the main stage, short screens scroll while the input remains reachable.
export function SessionStage({
  children,
  status,
  state,
  animation,
  prop = 'none',
  quiet = false,
  footer,
  info,
  onMoriiPress,
  moriiLabel,
  onEnd,
  onBack,
  onInfoOpen,
}: PropsWithChildren<{
  status: string;
  state: MoriiState;
  animation: MoriiAnimation;
  prop?: 'none' | 'idea-card';
  quiet?: boolean;
  footer: ReactNode;
  info: {
    title: string;
    body: string;
    actions?: { label: string; onPress: () => void }[];
  };
  onMoriiPress?: () => void;
  moriiLabel?: string;
  onEnd?: () => void;
  onBack?: () => void;
  onInfoOpen?: () => void;
}>) {
  const { locale } = useApp();
  // Static HTML and its first client render share one layout, actual dimensions follow hydration.
  const { fontScale, height, width } = useSyncExternalStore(
    subscribeWindow,
    windowSnapshot,
    serverWindowSnapshot,
  );
  const [heroHeight, setHeroHeight] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const content = Children.toArray(children);
  const hasContent = content.length > 0;
  const compact = height < 700 || fontScale > 1.4;
  const active = ['connecting', 'listening', 'thinking', 'speaking'].includes(state);
  const id = locale === 'id';
  const size = Math.max(
    160,
    Math.min(
      width - 32,
      420,
      compact ? height * (hasContent ? 0.36 : 0.58) : (heroHeight ?? height * 0.55) - 44,
    ),
  );
  const hero = (
    <View
      className={`items-center justify-center px-4 ${compact ? 'py-3' : 'min-h-0 flex-1'}`}
      onLayout={(event) => {
        setHeroHeight(event.nativeEvent.layout.height);
      }}
    >
      {onMoriiPress !== undefined ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={moriiLabel}
          onPress={onMoriiPress}
          className="rounded-full active:opacity-90"
        >
          <Morii
            pose="explain"
            size={size}
            state={state}
            animation={animation}
            prop={prop}
            quiet={quiet || showInfo}
          />
        </Pressable>
      ) : (
        <View accessible accessibilityLabel="Morii">
          <Morii
            pose="explain"
            size={size}
            state={state}
            animation={animation}
            prop={prop}
            quiet={quiet || showInfo}
          />
        </View>
      )}
      {status !== '' && (
        <Text
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          className="text-center text-sm leading-5 text-teal"
          style={
            active
              ? undefined
              : { position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'hidden' }
          }
        >
          {status}
        </Text>
      )}
    </View>
  );

  return (
    <StyledSafeAreaView className="flex-1 bg-cream">
      <SceneBackground />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="mx-auto w-full max-w-140 flex-row items-center justify-between px-5 pt-2 pb-1">
          <View className="w-26 flex-row">
            <IconButton
              icon="back"
              label={id ? 'Kembali' : 'Back'}
              onPress={() => {
                if (onBack !== undefined) onBack();
                else if (router.canGoBack()) router.back();
                else router.replace('/');
              }}
            />
          </View>
          <Text className="min-w-0 flex-1 text-center text-lg font-semibold tracking-[-0.5px] text-teal">
            morii
          </Text>
          <View className="w-26 flex-row justify-end gap-1">
            {onEnd !== undefined && (
              <IconButton icon="close" label={id ? 'Akhiri sesi' : 'End session'} onPress={onEnd} />
            )}
            <IconButton
              icon="info"
              label={id ? 'Tentang sesi ini' : 'About this session'}
              disabled={state === 'listening'}
              onPress={() => {
                onInfoOpen?.();
                setShowInfo(true);
              }}
            />
          </View>
        </View>
        {compact ? (
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName={`grow ${hasContent ? '' : 'justify-center'}`}
          >
            {hero}
            {hasContent && (
              <View className="mx-auto w-full max-w-140 gap-2 px-5 pb-2">{content}</View>
            )}
          </ScrollView>
        ) : (
          <>
            {hero}
            {hasContent && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: height * 0.34, flexGrow: 0 }}
                contentContainerClassName="px-5 pb-2"
              >
                <View className="mx-auto w-full max-w-140 gap-2">{content}</View>
              </ScrollView>
            )}
          </>
        )}
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: height * 0.45, flexGrow: 0 }}
          contentContainerClassName="px-5 pt-2 pb-5"
        >
          <View className="mx-auto w-full max-w-140 gap-2">{footer}</View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Sheet
        visible={showInfo}
        title={info.title}
        closeLabel={id ? 'Tutup informasi' : 'Close information'}
        onClose={() => {
          setShowInfo(false);
        }}
      >
        <Text className="text-base leading-7 text-muted">{info.body}</Text>
        {info.actions?.map((action) => (
          <Button
            key={action.label}
            variant="secondary"
            onPress={() => {
              setShowInfo(false);
              action.onPress();
            }}
          >
            {action.label}
          </Button>
        ))}
      </Sheet>
    </StyledSafeAreaView>
  );
}
