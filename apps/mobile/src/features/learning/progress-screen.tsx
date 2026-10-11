import { router } from 'expo-router';
import { Text, View, useWindowDimensions } from 'react-native';

import { Morii } from '@/components/morii';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Note, Paragraph, Title } from '@/components/typography';
import { firstMission } from '@/features/learning/mission';
import { useApp } from '@/state/app-context';

// Shows self-reported practice completion from this app session, not measured speaking ability.
export function ProgressScreen() {
  const { locale, completedMissionIds } = useApp();
  const { height, width } = useWindowDimensions();
  const id = locale === 'id';
  const complete = completedMissionIds.includes(firstMission.id);
  return (
    <Screen
      navigation
      footer={
        <Button
          onPress={() => {
            router.push('/practice');
          }}
        >
          {id
            ? complete
              ? 'Latihan lagi'
              : 'Mulai latihan'
            : complete
              ? 'Practice again'
              : 'Start practicing'}
        </Button>
      }
    >
      <View className="items-center gap-2 pt-3">
        <Text className="text-xs font-medium text-teal">{id ? 'LATIHANMU' : 'YOUR PRACTICE'}</Text>
        <Title>
          {complete
            ? id
              ? 'Satu cerita sudah dicoba.'
              : 'One story, tried.'
            : id
              ? 'Mulai dari satu cerita.'
              : 'Start with one story.'}
        </Title>
      </View>
      <Morii
        size={Math.max(160, Math.min(height < 740 ? height * 0.3 : 300, width - 80))}
        animation={complete ? 'encourage' : 'neutral'}
      />
      <View className="items-center gap-4 rounded-[28px] bg-surface px-6 py-5">
        <Paragraph>
          {id
            ? complete
              ? 'Coba ceritakan hal lain, dengan satu ide dan satu alasan.'
              : 'Mulai dengan satu hal yang kamu suka.'
            : complete
              ? 'Try another story, with one idea and one reason.'
              : 'Start with something you like.'}
        </Paragraph>
        <Note>
          {complete
            ? id
              ? 'Selesai menurutmu · sesi ini saja · kemampuan belum dinilai'
              : 'Marked complete by you · this session only · skill not assessed'
            : id
              ? 'Catatan sesi ini, bukan penilaian kemampuan.'
              : 'For this session, not a skill assessment.'}
        </Note>
      </View>
    </Screen>
  );
}
