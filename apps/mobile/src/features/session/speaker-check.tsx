import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Note, Title } from '@/components/typography';
import type { useLessonSpeech } from '@/features/learning/use-lesson-speech';
import type { Locale } from '@/state/app-context';

import { getVoiceSamples } from './voice-samples';
import type { VoiceObservation } from './voice-samples';

// Audition stays optional, listening notes never award progress or certify a teaching voice.
export function SpeakerCheck({
  locale,
  disabled,
  speaker,
}: {
  locale: Locale;
  disabled: boolean;
  speaker: ReturnType<typeof useLessonSpeech>;
}) {
  const id = locale === 'id';
  const [audition, setAudition] = useState(false);
  const [index, setIndex] = useState(0);
  const [heard, setHeard] = useState<'yes' | 'no' | null>(null);
  const [observation, setObservation] = useState<VoiceObservation | null>(null);
  const samples = getVoiceSamples(locale);
  const sample = samples[index] ?? samples[0];
  const speaking = speaker.state === 'starting' || speaker.state === 'speaking';
  const observations: Record<VoiceObservation, string> = {
    natural: id ? 'Alami' : 'Natural',
    flat: id ? 'Datar' : 'Flat',
    unclear: id ? 'Kurang jelas' : 'Unclear',
  };

  function clearPlayback() {
    speaker.stop();
    setHeard(null);
    setObservation(null);
  }

  return (
    <Card>
      <Title>1. Speaker</Title>
      {audition ? (
        <View className="gap-2">
          <Text
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            className="text-base font-semibold text-ink"
          >
            {String(index + 1)}/{String(samples.length)} · {sample.title}
          </Text>
          <Text className="text-base leading-7 text-ink">{sample.text}</Text>
          <Note>{sample.focus}</Note>
        </View>
      ) : (
        <Note>
          {id
            ? 'Putar contoh, lalu periksa apakah terdengar jelas.'
            : 'Play the example, then check whether you can hear it clearly.'}
        </Note>
      )}
      <Button
        disabled={disabled}
        onPress={() => {
          setHeard(null);
          setObservation(null);
          if (speaking) speaker.stop();
          else
            void speaker.play(
              audition
                ? sample.text
                : id
                  ? 'Saya akan menjelaskan aturan permainan yang saya suka.'
                  : 'I will explain the rules of a game I enjoy.',
            );
        }}
      >
        {speaking
          ? id
            ? 'Hentikan contoh'
            : 'Stop example'
          : id
            ? 'Putar contoh suara'
            : 'Play voice example'}
      </Button>
      {speaker.state === 'unavailable' && (
        <Note>
          {speaker.failure === 'voice'
            ? id
              ? 'Suara untuk bahasa ini belum tersedia. Periksa bahasa di pengaturan text-to-speech perangkat.'
              : 'A voice for this language is unavailable. Check languages in the device text-to-speech settings.'
            : speaker.failure === 'timeout'
              ? id
                ? 'Mesin suara belum merespons. Coba lagi atau periksa pengaturan text-to-speech perangkat.'
                : 'The speech engine did not respond. Try again or check device text-to-speech settings.'
              : id
                ? 'Contoh suara gagal diputar. Periksa mesin text-to-speech perangkat lalu coba lagi.'
                : 'The voice example could not play. Check the device text-to-speech engine and try again.'}
        </Note>
      )}
      {speaker.completed &&
        speaker.state === 'idle' &&
        (audition ? (
          <View className="gap-2">
            <Note>{id ? 'Bagaimana suara yang Anda dengar?' : 'How did the voice sound?'}</Note>
            {(['natural', 'flat', 'unclear'] satisfies readonly VoiceObservation[]).map((value) => (
              <Button
                key={value}
                variant="secondary"
                selected={observation === value}
                disabled={disabled}
                onPress={() => {
                  setObservation(value);
                }}
              >
                {observations[value]}
              </Button>
            ))}
            {observation !== null && (
              <Note>
                {id
                  ? 'Catatan pendengaran ini hanya ada di layar ini, bukan hasil penilaian AI.'
                  : 'This listening note stays on this screen, it is not an AI assessment.'}
              </Note>
            )}
          </View>
        ) : (
          <View className="flex-row gap-2">
            {(['yes', 'no'] satisfies readonly ('yes' | 'no')[]).map((value) => (
              <View key={value} className="flex-1">
                <Button
                  variant="secondary"
                  selected={heard === value}
                  disabled={disabled}
                  onPress={() => {
                    setHeard(value);
                  }}
                >
                  {value === 'yes'
                    ? id
                      ? 'Terdengar'
                      : 'I heard it'
                    : id
                      ? 'Tidak terdengar'
                      : 'I did not hear it'}
                </Button>
              </View>
            ))}
          </View>
        ))}
      {heard === 'no' && (
        <Note>
          {id
            ? 'Periksa volume media dan perangkat audio yang terhubung.'
            : 'Check media volume and connected audio devices.'}
        </Note>
      )}
      {audition && (
        <Button
          variant="secondary"
          disabled={disabled || speaking}
          onPress={() => {
            clearPlayback();
            setIndex((index + 1) % samples.length);
          }}
        >
          {id ? 'Contoh berikutnya' : 'Next example'}
        </Button>
      )}
      <Button
        variant="secondary"
        expanded={audition}
        disabled={disabled}
        onPress={() => {
          clearPlayback();
          setIndex(0);
          setAudition(!audition);
        }}
      >
        {audition
          ? id
            ? 'Tutup uji intonasi'
            : 'Close intonation check'
          : id
            ? 'Uji intonasi'
            : 'Check intonation'}
      </Button>
      <Note>
        {id
          ? 'Ini suara perangkat, belum suara final Morii. Hasil uji dengar tidak disimpan.'
          : 'This is a device voice, not Morii’s final voice. Listening notes are not saved.'}
      </Note>
    </Card>
  );
}
