import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { BackButton } from '@/components/navigation';
import { Screen } from '@/components/screen';
import { Heading, Note, Paragraph, Title } from '@/components/typography';
import { useLessonSpeech } from '@/features/learning/use-lesson-speech';
import { useApp } from '@/state/app-context';

import { SpeakerCheck } from './speaker-check';
import { useMicrophoneCheck } from './use-microphone-check';
import type { MicrophoneStatus } from './microphone-check';

// Adult testers verify device audio separately from recognition, AI coaching, and final voice selection.
export function DeviceCheckScreen() {
  const { locale } = useApp();
  const id = locale === 'id';
  const [confirmed, setConfirmed] = useState(false);
  const microphone = useMicrophoneCheck();
  const speaker = useLessonSpeech(locale);
  const speaking = speaker.state === 'starting' || speaker.state === 'speaking';
  const microphoneBusy = ['permission', 'starting', 'listening', 'stopping'].includes(
    microphone.status,
  );
  const level = Math.round(microphone.level * 100);
  const micStatus: Record<MicrophoneStatus, string> = {
    idle: id ? 'Mikrofon mati.' : 'Microphone off.',
    permission: id ? 'Menunggu izin mikrofon.' : 'Waiting for microphone permission.',
    starting: id ? 'Menyiapkan mikrofon…' : 'Preparing microphone…',
    listening: id ? 'Mikrofon menyala, ucapkan satu kalimat.' : 'Microphone on, say one sentence.',
    stopping: id ? 'Menghentikan mikrofon…' : 'Stopping microphone…',
    complete: !microphone.received
      ? id
        ? 'Tidak ada audio masuk. Coba periksa mikrofon.'
        : 'No audio arrived. Check your microphone.'
      : microphone.peak === 0
        ? id
          ? 'Audio masuk, tetapi levelnya nol.'
          : 'Audio arrived with a zero input level.'
        : id
          ? 'Audio masuk dari mikrofon.'
          : 'Audio arrived from the microphone.',
    cancelled:
      microphone.cancelledBy === 'navigation'
        ? id
          ? 'Layar berubah, jadi uji dihentikan. Mikrofon mati. Mulai lagi saat siap.'
          : 'The screen changed, so the check stopped. Microphone off. Start again when ready.'
        : id
          ? 'Aplikasi tidak aktif, jadi uji dihentikan. Mikrofon mati. Kembali ke aplikasi lalu mulai lagi.'
          : 'The app became inactive, so the check stopped. Microphone off. Return to the app and start again.',
    denied: id
      ? 'Izin mikrofon ditolak. Periksa pengaturan perangkat.'
      : 'Microphone permission was denied. Check device settings.',
    failed: id
      ? 'Uji audio belum berhasil. Coba lagi saat siap.'
      : 'The audio check failed. Try again when ready.',
  };

  return (
    <Screen>
      <BackButton />
      <Heading>{id ? 'Periksa audio perangkat' : 'Check device audio'}</Heading>
      {!confirmed ? (
        <Card>
          <Title>{id ? 'Uji lokal untuk dewasa' : 'Local test for adults'}</Title>
          <Paragraph>
            {id
              ? 'Gunakan suara Anda sendiri. Uji ini tidak menyimpan atau mengirim audio ke server.'
              : 'Use your own voice. This check does not save or send audio to a server.'}
          </Paragraph>
          <Note>
            {id
              ? 'Mikrofon tetap mati sampai Anda memulai uji.'
              : 'The microphone stays off until you start a check.'}
          </Note>
          <Button
            onPress={() => {
              setConfirmed(true);
            }}
          >
            {id ? 'Saya dewasa, lanjutkan' : 'I am an adult, continue'}
          </Button>
        </Card>
      ) : (
        <>
          <SpeakerCheck key={locale} locale={locale} disabled={microphoneBusy} speaker={speaker} />
          <Card>
            <Title>2. {id ? 'Mikrofon' : 'Microphone'}</Title>
            {microphone.supported ? (
              <>
                <Note>
                  {id
                    ? 'Ucapkan satu kalimat dengan volume nyaman. Uji berhenti otomatis setelah enam detik.'
                    : 'Say one sentence at a comfortable volume. The check stops automatically after six seconds.'}
                </Note>
                <View
                  accessibilityRole="progressbar"
                  accessibilityLabel={id ? 'Level input audio' : 'Audio input level'}
                  accessibilityValue={{ min: 0, max: 100, now: level }}
                  className="h-3 overflow-hidden rounded-full bg-line"
                >
                  <View
                    className="h-full w-full rounded-full bg-teal"
                    style={{ transform: [{ scaleX: level / 100 }], transformOrigin: 'left center' }}
                  />
                </View>
                <Text accessibilityLiveRegion="polite" className="text-base leading-6 text-ink">
                  {micStatus[microphone.status]}
                </Text>
                <Button
                  disabled={
                    speaking ||
                    microphone.status === 'permission' ||
                    microphone.status === 'starting' ||
                    microphone.status === 'stopping'
                  }
                  onPress={() => {
                    if (microphone.status === 'listening') void microphone.stop();
                    else {
                      speaker.stop();
                      void microphone.start();
                    }
                  }}
                >
                  {microphone.status === 'listening'
                    ? id
                      ? 'Hentikan uji'
                      : 'Stop check'
                    : id
                      ? 'Mulai uji mikrofon'
                      : 'Start microphone check'}
                </Button>
                {microphone.status === 'complete' && microphone.sampleRate !== null && (
                  <Note>
                    {String(microphone.sampleRate)} Hz · {microphone.seconds.toFixed(1)}{' '}
                    {id ? 'detik audio masuk' : 'seconds of audio received'}
                  </Note>
                )}
              </>
            ) : (
              <Note>
                {id
                  ? 'Uji mikrofon memerlukan development build Android atau iOS. Browser hanya mendukung contoh suara perangkat.'
                  : 'Microphone checking needs an Android or iOS development build. The browser only supports device voice examples.'}
              </Note>
            )}
          </Card>
          <Note>
            {id
              ? 'Hasil ini hanya memeriksa perangkat. Pengenalan ucapan, AI, dan suara Morii dari server perlu diuji terpisah.'
              : 'These results only check your device. Speech recognition, AI, and Morii’s server voice need separate tests.'}
          </Note>
        </>
      )}
    </Screen>
  );
}
