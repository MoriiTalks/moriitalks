import { router } from 'expo-router';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Heading, Paragraph } from '@/components/typography';
import { useApp } from '@/state/app-context';

// Gives unavailable routes a localized path back to the home screen.
export default function NotFoundScreen() {
  const { locale } = useApp();
  return (
    <Screen>
      <Heading>{locale === 'id' ? 'Mari kembali ke beranda.' : 'Let’s head home.'}</Heading>
      <Paragraph>
        {locale === 'id' ? 'Halaman ini belum tersedia.' : 'This page is not available.'}
      </Paragraph>
      <Button
        onPress={() => {
          router.replace('/');
        }}
      >
        {locale === 'id' ? 'Ke beranda' : 'Go home'}
      </Button>
    </Screen>
  );
}
