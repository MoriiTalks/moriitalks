import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Morii } from '@/components/morii';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Eyebrow, Heading, Note, Paragraph, Title } from '@/components/typography';
import { firstMission } from '@/features/learning/mission';
import { useApp } from '@/state/app-context';

export function HomeScreen() {
  const { locale } = useApp();
  const id = locale === 'id';
  const mission = firstMission.locales[locale];
  return (
    <Screen navigation>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-2xl font-extrabold tracking-[-1px] text-ink">
          morii<Text className="text-teal">talks</Text>
        </Text>
        <Text className="text-xs text-muted">{id ? 'Bahasa Indonesia' : 'English'}</Text>
      </View>
      <View className="items-center gap-3">
        <Morii size={220} />
        <Heading>{id ? 'Hai, aku Morii.' : 'Hi, I’m Morii.'}</Heading>
        <Paragraph>
          {id ? 'Pelan-pelan, satu cerita dulu.' : 'One little story at a time.'}
        </Paragraph>
      </View>
      <Card>
        <Eyebrow>{id ? 'LATIHAN PERTAMA · 3 LANGKAH' : 'FIRST PRACTICE · 3 STEPS'}</Eyebrow>
        <Title>{mission.title}</Title>
        <Paragraph>{mission.goal}</Paragraph>
        <Button
          onPress={() => {
            router.push('/practice');
          }}
        >
          {id ? 'Mulai latihan →' : 'Start practicing →'}
        </Button>
      </Card>
      <Button
        variant="secondary"
        onPress={() => {
          router.push('/talk');
        }}
      >
        {id ? 'Ngobrol dengan Morii' : 'Talk with Morii'}
      </Button>
      <Note>
        {id ? 'Latihan mandiri dan demo obrolan.' : 'Independent practice and a chat demo.'}
      </Note>
    </Screen>
  );
}
