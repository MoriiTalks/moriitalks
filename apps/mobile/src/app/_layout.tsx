import '../../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { AppProvider } from '@/state/app-context';

// Provides shared in-memory state and safe-area context for every Expo route.
export default function RootLayout() {
  const contentStyle = useResolveClassNames('bg-cream');

  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle }} />
      </AppProvider>
    </SafeAreaProvider>
  );
}
