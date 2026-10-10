import { router } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { Morii } from '@/components/morii';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
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
      <Morii size={Math.min(height < 740 ? 200 : 270, width - 64)} />
      <Card>
        <Title>
          {complete
            ? id
              ? 'Sudah dicoba.'
              : 'Practice recorded.'
            : id
              ? 'Siap dicoba.'
              : 'Ready to try.'}
        </Title>
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
          {id
            ? 'Catatan sesi ini, bukan penilaian kemampuan.'
            : 'For this session, not a skill assessment.'}
        </Note>
      </Card>
    </Screen>
  );
}
