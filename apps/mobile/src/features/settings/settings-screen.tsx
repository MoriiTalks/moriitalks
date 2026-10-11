import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Heading, Note, Title } from '@/components/typography';
import { useApp } from '@/state/app-context';

// Updates the in-memory locale and exposes the separate adult voice lab.
export function SettingsScreen() {
  const { locale, setLocale } = useApp();
  const id = locale === 'id';
  return (
    <Screen navigation>
      <View className="gap-2 pt-3">
        <Heading>{id ? 'Ruangmu.' : 'Your space.'}</Heading>
        <Note>
          {id
            ? 'Sedikit pengaturan, lalu lanjut cerita.'
            : 'A few preferences, then back to your story.'}
        </Note>
      </View>
      <Card>
        <Title>{id ? 'Bahasa' : 'Language'}</Title>
        <View className="gap-2">
          <Button
            selected={id}
            variant={id ? 'primary' : 'secondary'}
            onPress={() => {
              setLocale('id');
            }}
          >
            Bahasa Indonesia
          </Button>
          <Button
            selected={!id}
            variant={!id ? 'primary' : 'secondary'}
            onPress={() => {
              setLocale('en');
            }}
          >
            English
          </Button>
        </View>
      </Card>
      <Card>
        <Title>{id ? 'Tentang versi ini' : 'About this version'}</Title>
        <Text className="text-sm leading-6 text-muted">
          {id
            ? 'Obrolan dengan Morii memakai contoh tertulis yang terprogram, belum AI langsung. Latihan mandiri tidak memakai mikrofon.'
            : 'Talk with Morii uses scripted text examples, not live AI. Independent practice does not use your microphone.'}
        </Text>
        <Note>
          {id
            ? 'Bahasa dan catatan latihan tersimpan selama sesi aplikasi ini.'
            : 'Language and practice notes last for this app session.'}
        </Note>
        <Text className="text-sm leading-6 text-muted">
          {id
            ? 'Uji suara AI di aplikasi native hanya untuk penguji dewasa, dan harus diaktifkan.'
            : 'Native AI voice testing is for adult testers and must be enabled.'}
        </Text>
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
