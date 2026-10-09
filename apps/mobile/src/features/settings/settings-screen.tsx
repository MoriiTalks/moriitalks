import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Eyebrow, Heading, Note, Paragraph, Title } from '@/components/typography';
import { useApp } from '@/state/app-context';

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
          variant={id ? 'primary' : 'secondary'}
          onPress={() => {
            setLocale('id');
          }}
        >
          Bahasa Indonesia{id ? ' ✓' : ''}
        </Button>
        <Button
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
            ? 'Kenali Morii dan coba satu latihan mandiri. Aplikasi belum merekam suara, menghubungi AI, atau membuat akun.'
            : 'Meet Morii and try one independent practice. This app does not yet record voice, call AI, or create accounts.'}
        </Paragraph>
        <Note>
          {id
            ? 'Bahasa dan catatan latihan kembali ke awal setelah aplikasi dimulai ulang.'
            : 'Language and practice notes reset when the app restarts.'}
        </Note>
      </Card>
      <Note>MoriiTalks · 0.1.0</Note>
    </Screen>
  );
}
