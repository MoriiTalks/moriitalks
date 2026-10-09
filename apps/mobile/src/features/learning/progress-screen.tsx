import { router } from 'expo-router';

import { Morii } from '@/components/morii';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Eyebrow, Heading, Note, Paragraph, Title } from '@/components/typography';
import { firstMission } from '@/features/learning/mission';
import { useApp } from '@/state/app-context';

export function ProgressScreen() {
  const { locale, completedMissionIds } = useApp();
  const id = locale === 'id';
  const complete = completedMissionIds.includes(firstMission.id);
  return (
    <Screen navigation>
      <Eyebrow>{id ? 'LANGKAH KECILMU' : 'YOUR LITTLE STEPS'}</Eyebrow>
      <Heading>{id ? 'Ruang untuk berkembang.' : 'Room to grow.'}</Heading>
      <Morii size={220} />
      <Card>
        <Eyebrow>
          {complete ? (id ? 'SUDAH DICOBA' : 'PRACTICED') : id ? 'SIAP DICOBA' : 'READY TO TRY'}
        </Eyebrow>
        <Title>{firstMission.locales[locale].title}</Title>
        <Paragraph>
          {id
            ? complete
              ? 'Kamu sudah mencoba. Lain kali, pilih hal lain yang kamu suka untuk diceritakan.'
              : 'Mulai dari satu hal yang kamu suka. Tidak perlu terburu-buru.'
            : complete
              ? 'You gave it a try. Next time, choose something else you enjoy to talk about.'
              : 'Start with something you like. There’s no need to rush.'}
        </Paragraph>
        <Button
          onPress={() => {
            router.push('/practice');
          }}
        >
          {complete
            ? id
              ? 'Coba topik lain'
              : 'Try another topic'
            : id
              ? 'Mulai latihan'
              : 'Start practicing'}
        </Button>
      </Card>
      <Note>
        {id
          ? 'Catatan latihan disimpan sampai aplikasi ditutup.'
          : 'Practice notes stay here until you close the app.'}
      </Note>
    </Screen>
  );
}
