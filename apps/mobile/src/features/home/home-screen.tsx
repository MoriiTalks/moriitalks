import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Morii } from '@/components/morii';
import { Button } from '@/components/button';
import { IconButton } from '@/components/icon-button';
import { Screen } from '@/components/screen';
import { Heading, Paragraph } from '@/components/typography';
import { useApp } from '@/state/app-context';

// Gives practice and conversation one clear entry each, preferences stay in the header.
export function HomeScreen() {
  const { locale } = useApp();
  const [moriiSize, setMoriiSize] = useState(300);
  const id = locale === 'id';
  return (
    <Screen
      footer={
        <View className="gap-2">
          <Button
            onPress={() => {
              router.push('/practice');
            }}
          >
            {id ? 'Mulai latihan' : 'Start practice'}
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              router.push('/talk');
            }}
          >
            {id ? 'Bicara dengan Morii' : 'Talk with Morii'}
          </Button>
        </View>
      }
    >
      <View className="flex-1 gap-5">
        <View className="flex-row items-center justify-between gap-4">
          <Text className="text-xl font-bold tracking-[-0.8px] text-ink">
            morii<Text className="text-teal">talks</Text>
          </Text>
          <IconButton
            icon="settings"
            label={id ? 'Pengaturan' : 'Settings'}
            onPress={() => {
              router.push('/settings');
            }}
          />
        </View>
        <View
          className="min-h-0 flex-1 items-center justify-center gap-3"
          onLayout={(event) => {
            const { height, width } = event.nativeEvent.layout;
            setMoriiSize(Math.max(160, Math.min(width - 12, height - 100, 360)));
          }}
        >
          <Heading>{id ? 'Siap bicara?' : 'Ready to speak?'}</Heading>
          <Paragraph>
            {id ? 'Latihan berbicara dan presentasi.' : 'Practice explaining and presenting.'}
          </Paragraph>
          <Morii size={moriiSize} animation="wave" />
        </View>
      </View>
    </Screen>
  );
}
