import { router } from 'expo-router';
import { Text, View, useWindowDimensions } from 'react-native';

import { Morii } from '@/components/morii';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Paragraph, Title } from '@/components/typography';
import { firstMission } from '@/features/learning/mission';
import { useApp } from '@/state/app-context';

// Offers the bundled first mission and a separate scripted conversation preview.
export function HomeScreen() {
  const { locale } = useApp();
  const { height, width } = useWindowDimensions();
  const id = locale === 'id';
  const mission = firstMission.locales[locale];
  const moriiSize = height < 740 ? Math.min(220, width * 0.625) : 280;
  return (
    <Screen
      navigation
      footer={
        <View className="gap-3">
          <Button
            onPress={() => {
              router.push('/practice');
            }}
          >
            {id ? 'Mulai latihan' : 'Start practicing'}
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              router.push('/talk');
            }}
          >
            {id ? 'Contoh obrolan' : 'Chat example'}
          </Button>
        </View>
      }
    >
      <View className="gap-3">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-2xl font-extrabold tracking-[-1px] text-ink">
            morii<Text className="text-teal">talks</Text>
          </Text>
          <Text className="shrink text-right text-xs text-muted">
            {id ? 'Bahasa Indonesia' : 'English'}
          </Text>
        </View>
        <Morii size={moriiSize} />
        <View className="gap-2">
          <Title>{mission.title}</Title>
          <Paragraph>{mission.goal}</Paragraph>
        </View>
      </View>
    </Screen>
  );
}
