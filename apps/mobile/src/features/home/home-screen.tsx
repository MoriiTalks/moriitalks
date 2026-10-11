import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Morii } from '@/components/morii';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Heading, Paragraph } from '@/components/typography';
import { useApp } from '@/state/app-context';

// Keeps Morii and one invitation central, the preview details remain available in settings.
export function HomeScreen() {
  const { locale } = useApp();
  const [moriiSize, setMoriiSize] = useState(300);
  const id = locale === 'id';
  return (
    <Screen
      navigation
      footer={
        <View className="gap-2">
          <Button
            onPress={() => {
              router.push('/talk');
            }}
          >
            {id ? 'Cerita dengan Morii' : 'Talk with Morii'}
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              router.push('/practice');
            }}
          >
            {id ? 'Latihan singkat' : 'A little practice'}
          </Button>
        </View>
      }
    >
      <View className="flex-1 gap-5">
        <View className="flex-row items-center justify-between gap-4">
          <Text className="text-xl font-bold tracking-[-0.8px] text-ink">
            morii<Text className="text-teal">talks</Text>
          </Text>
          <Text className="text-xs font-medium text-muted">{id ? 'Indonesia' : 'English'}</Text>
        </View>
        <View
          className="min-h-0 flex-1 items-center justify-center gap-3"
          onLayout={(event) => {
            const { height, width } = event.nativeEvent.layout;
            setMoriiSize(Math.max(160, Math.min(width - 12, height - 100, 360)));
          }}
        >
          <Heading>{id ? 'Ada cerita apa?' : 'What’s your story?'}</Heading>
          <Paragraph>{id ? 'Ada waktu untuk ceritamu.' : 'There’s room for your story.'}</Paragraph>
          <Morii size={moriiSize} animation="wave" />
        </View>
      </View>
    </Screen>
  );
}
