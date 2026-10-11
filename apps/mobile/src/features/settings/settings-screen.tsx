import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import { Heading, Note, Title } from '@/components/typography';
import { useApp } from '@/state/app-context';

// Keeps language, local practice information, and adult testing separate from lessons.
export function SettingsScreen() {
  const { locale, setLocale, progressStorageStatus, resetPracticeProgress } = useApp();
  const [showReset, setShowReset] = useState(false);
  const id = locale === 'id';
  return (
    <Screen navigation>
      <View className="gap-2 pt-3">
        <Heading>{id ? 'Pengaturan' : 'Settings'}</Heading>
        <Note>{id ? 'Pilih bahasa latihanmu.' : 'Choose your practice language.'}</Note>
      </View>
      <Card>
        <Title>{id ? 'Bahasa' : 'Language'}</Title>
        <View className="gap-2">
          <Button
            disabled={progressStorageStatus === 'loading'}
            selected={id}
            variant={id ? 'primary' : 'secondary'}
            onPress={() => {
              setLocale('id');
            }}
          >
            Bahasa Indonesia
          </Button>
          <Button
            disabled={progressStorageStatus === 'loading'}
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
      <Button
        variant="secondary"
        onPress={() => {
          router.push('/progress');
        }}
      >
        {id ? 'Catatan latihan' : 'Practice record'}
      </Button>
      <Card>
        <Title>{id ? 'Tentang versi ini' : 'About this version'}</Title>
        <Text className="text-sm leading-6 text-muted">
          {id
            ? 'Latihan memakai materi yang tersedia di perangkat. Contoh suara dapat diputar ulang. Selesai latihan adalah catatan percobaanmu, bukan nilai kemampuan.'
            : 'Practice uses bundled lessons with replayable spoken examples. Completion records your attempt, not a skill score.'}
        </Text>
        <Note>
          {progressStorageStatus === 'loading'
            ? id
              ? 'Memuat catatan di perangkat…'
              : 'Loading local practice…'
            : progressStorageStatus === 'saving'
              ? id
                ? 'Menyimpan catatan di perangkat…'
                : 'Saving practice on this device…'
              : progressStorageStatus === 'unavailable'
                ? id
                  ? 'Penyimpanan belum tersedia. Catatan baru hanya berlaku selama aplikasi terbuka.'
                  : 'Storage is unavailable. New practice records last for this app session.'
                : id
                  ? 'Pelajaran tersimpan terpisah untuk Indonesia dan Inggris. Hari latihan dihitung bersama, hanya di perangkat ini.'
                  : 'Lesson completion is separate for Indonesian and English. Practice days are shared, only on this device.'}
        </Note>
        <Text className="text-sm leading-6 text-muted">
          {id
            ? 'Morii memiliki contoh percakapan terprogram. Percakapan AI langsung memerlukan konfigurasi server dan opt-in penguji dewasa.'
            : 'Morii includes scripted conversation examples. Live AI needs a configured server and adult tester opt-in.'}
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
      <Button
        variant="secondary"
        disabled={progressStorageStatus === 'loading'}
        onPress={() => {
          setShowReset(true);
        }}
      >
        {id ? 'Hapus catatan latihan' : 'Clear practice records'}
      </Button>
      <Note>MoriiTalks · 0.1.0</Note>
      <Sheet
        visible={showReset}
        title={id ? 'Mulai dari awal?' : 'Start fresh?'}
        closeLabel={id ? 'Batal' : 'Cancel'}
        onClose={() => {
          setShowReset(false);
        }}
      >
        <Note>
          {id
            ? 'Catatan pelajaran Indonesia dan Inggris serta hari latihan di perangkat ini akan dihapus. Bahasa pilihanmu tetap sama.'
            : 'Indonesian and English lesson records and practice days on this device will be cleared. Your language preference stays the same.'}
        </Note>
        <Button
          onPress={() => {
            resetPracticeProgress();
            setShowReset(false);
          }}
        >
          {id ? 'Hapus catatan' : 'Clear records'}
        </Button>
        <Button
          variant="secondary"
          onPress={() => {
            setShowReset(false);
          }}
        >
          {id ? 'Batal' : 'Cancel'}
        </Button>
      </Sheet>
    </Screen>
  );
}
