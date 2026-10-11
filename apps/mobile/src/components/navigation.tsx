import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon';
import { useApp } from '@/state/app-context';

// Direct links may have no navigation history, so returning home is the fallback.
export function BackButton() {
  const { locale } = useApp();

  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-12 flex-row items-center justify-center gap-1.5 self-start rounded-full pr-3 active:bg-mint"
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      }}
    >
      <Icon name="back" size={19} />
      <Text className="text-sm font-medium text-ink">{locale === 'id' ? 'Kembali' : 'Back'}</Text>
    </Pressable>
  );
}

// Main-section tabs replace the current route to avoid stacking repeated section visits.
export function Navigation() {
  const pathname = usePathname();
  const { locale } = useApp();
  const items = [
    { path: '/', icon: 'home', label: locale === 'id' ? 'Beranda' : 'Home' },
    { path: '/progress', icon: 'progress', label: locale === 'id' ? 'Latihan' : 'Practice' },
    { path: '/settings', icon: 'settings', label: locale === 'id' ? 'Pengaturan' : 'Settings' },
  ] satisfies readonly { path: '/' | '/progress' | '/settings'; icon: IconName; label: string }[];

  return (
    <View
      accessibilityRole="tablist"
      className="mx-5 mb-3 flex-row gap-1 rounded-[28px] border border-line bg-surface p-1.5"
    >
      {items.map((item) => {
        const active = pathname === item.path;

        return (
          <Pressable
            key={item.path}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            onPress={() => {
              router.replace(item.path);
            }}
            className={`min-h-14 flex-1 items-center justify-center gap-1 rounded-[22px] px-1 py-2 active:bg-mint ${active ? 'bg-mist' : ''}`}
          >
            <Icon name={item.icon} size={19} color={active ? '#176B61' : '#5C7068'} />
            <Text
              className={`text-center text-sm ${active ? 'font-semibold text-teal underline' : 'font-medium text-muted'}`}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
