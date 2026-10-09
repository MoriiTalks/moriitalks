import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useApp } from '@/state/app-context';

export function BackButton() {
  const { locale } = useApp();

  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-12 justify-center self-start px-1 active:opacity-80"
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      }}
    >
      <Text className="text-base font-semibold text-teal">
        {locale === 'id' ? '← Kembali' : '← Back'}
      </Text>
    </Pressable>
  );
}

export function Navigation() {
  const pathname = usePathname();
  const { locale } = useApp();
  const items = [
    { path: '/', label: locale === 'id' ? 'Beranda' : 'Home' },
    { path: '/progress', label: locale === 'id' ? 'Progres' : 'Progress' },
    { path: '/settings', label: locale === 'id' ? 'Pengaturan' : 'Settings' },
  ] as const;

  return (
    <View
      accessibilityRole="tablist"
      className="flex-row gap-1.5 border-t border-line bg-cream p-3"
    >
      {items.map((item) => {
        const active = pathname === item.path;

        return (
          <Pressable
            key={item.path}
            accessibilityRole="tab"
            aria-selected={active}
            onPress={() => {
              router.replace(item.path);
            }}
            className={`min-h-12 flex-1 items-center justify-center rounded-2xl active:opacity-80 ${active ? 'bg-mint' : ''}`}
          >
            <Text className={`text-xs font-semibold ${active ? 'text-teal' : 'text-muted'}`}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
