import { router } from 'expo-router';
import { useState } from 'react';

import { Morii } from '@/components/morii';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { BackButton } from '@/components/navigation';
import { Eyebrow, Heading, Note, Paragraph, Title } from '@/components/typography';
import { firstMission } from '@/features/learning/mission';
import { useApp } from '@/state/app-context';

export function PracticeScreen() {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const { locale, completeMission } = useApp();
  const id = locale === 'id';
  const mission = firstMission.locales[locale];

  function finish() {
    completeMission(firstMission.id);
    setStep(3);
  }

  return (
    <Screen>
      <BackButton />
      <Eyebrow>{id ? 'LATIHAN MANDIRI' : 'INDEPENDENT PRACTICE'}</Eyebrow>
      <Morii pose={step === 1 ? 'listen' : 'wave'} size={190} />
      {step === 0 && (
        <>
          <Heading>{mission.title}</Heading>
          <Paragraph>{mission.goal}</Paragraph>
          <Card>
            <Eyebrow>{id ? '1 / 3 · LIHAT CONTOH' : '1 / 3 · SEE AN EXAMPLE'}</Eyebrow>
            <Title>{mission.example}</Title>
            <Paragraph>{mission.exampleNote}</Paragraph>
          </Card>
          <Button
            onPress={() => {
              setStep(1);
            }}
          >
            {id ? 'Sekarang giliranku' : 'My turn'}
          </Button>
        </>
      )}
      {step === 1 && (
        <>
          <Heading>{id ? 'Ceritakan versimu.' : 'Tell your own story.'}</Heading>
          <Card>
            <Eyebrow>{id ? '2 / 3 · COBA UCAPKAN' : '2 / 3 · SAY IT OUT LOUD'}</Eyebrow>
            <Paragraph>{mission.prompt}</Paragraph>
            <Title>{mission.starter}</Title>
            <Note>
              {id
                ? 'Ucapkan sendiri atau bersama pendamping. Aplikasi tidak mendengarkan.'
                : 'Practice on your own or with a trusted adult. The app is not listening.'}
            </Note>
          </Card>
          <Button
            onPress={() => {
              setStep(2);
            }}
          >
            {id ? 'Aku sudah mencoba' : 'I’ve tried it'}
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              setStep(0);
            }}
          >
            {id ? 'Lihat contoh lagi' : 'See the example again'}
          </Button>
        </>
      )}
      {step === 2 && (
        <>
          <Heading>{id ? 'Satu alasan membantu.' : 'A reason helps.'}</Heading>
          <Card>
            <Eyebrow>{id ? '3 / 3 · COBA LAGI' : '3 / 3 · TRY AGAIN'}</Eyebrow>
            <Paragraph>{mission.retry}</Paragraph>
            <Note>
              {id
                ? 'Ini panduan latihan, bukan penilaian atas ucapanmu.'
                : 'This is a practice guide, not an assessment of your speech.'}
            </Note>
          </Card>
          <Button onPress={finish}>
            {id ? 'Sudah mencoba lagi · selesai' : 'I tried again · finish'}
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              setStep(1);
            }}
          >
            {id ? 'Kembali ke kalimatku' : 'Back to my sentence'}
          </Button>
        </>
      )}
      {step === 3 && (
        <>
          <Heading>{id ? 'Latihanmu sudah dicatat.' : 'Your practice is marked complete.'}</Heading>
          <Paragraph>{mission.transfer}</Paragraph>
          <Note>
            {id
              ? 'Catatan ini tersimpan selama aplikasi terbuka. Kemampuan berbicara belum dinilai.'
              : 'This note lasts while the app is open. Speaking skill has not been assessed.'}
          </Note>
          <Button
            onPress={() => {
              router.replace('/progress');
            }}
          >
            {id ? 'Lihat latihan hari ini' : 'See today’s practice'}
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              router.replace('/');
            }}
          >
            {id ? 'Kembali ke beranda' : 'Go home'}
          </Button>
        </>
      )}
    </Screen>
  );
}
