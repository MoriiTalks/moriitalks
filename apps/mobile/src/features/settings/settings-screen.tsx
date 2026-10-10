import { router } from 'expo-router';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Eyebrow, Heading, Note, Paragraph, Title } from '@/components/typography';
import { useApp } from '@/state/app-context';

// Updates the in-memory locale and exposes the separate adult voice lab.
export function SettingsScreen() {
  const { locale, setLocale } = useApp();
  const id = locale === 'id';
  return (
    <Screen navigation>
      <Eyebrow>{id ? 'SESUAIKAN RUANGMU' : 'MAKE IT YOURS'}</Eyebrow>
      <Heading>{id ? 'Pengaturan' : 'Settings'}</Heading>
      <Card>
        <Title>{id ? 'Bahasa' : 'Language'}</Title>
        <Paragraph>
          {id
            ? 'Pilih bahasa tampilan dan latihan contoh.'
            : 'Choose the language for the interface and sample practice.'}
        </Paragraph>
        <Button
          selected={id}
          variant={id ? 'primary' : 'secondary'}
          onPress={() => {
            setLocale('id');
          }}
        >
          Bahasa Indonesia{id ? ' ✓' : ''}
        </Button>
        <Button
          selected={!id}
          variant={!id ? 'primary' : 'secondary'}
          onPress={() => {
            setLocale('en');
          }}
        >
          English{!id ? ' ✓' : ''}
        </Button>
      </Card>
      <Card>
        <Title>{id ? 'Tentang versi ini' : 'About this preview'}</Title>
        <Paragraph>
          {id
            ? 'Latihan contoh tidak memakai mikrofon. Uji suara AI di aplikasi native hanya untuk penguji dewasa dan perlu diaktifkan.'
            : 'Practice examples do not use your microphone. Native AI voice testing is for adults and must be enabled.'}
        </Paragraph>
        <Note>
          {id
            ? 'Bahasa dan catatan latihan kembali ke awal setelah aplikasi dimulai ulang.'
            : 'Language and practice notes reset when the app restarts.'}
        </Note>
        <Button
          variant="secondary"
          onPress={() => {
            router.push('/voice-lab');
          }}
        >
          {id ? 'Uji suara untuk dewasa' : 'Voice test for adults'}
        </Button>
      </Card>
      <Note>MoriiTalks · 0.1.0</Note>
    </Screen>
  );
}
