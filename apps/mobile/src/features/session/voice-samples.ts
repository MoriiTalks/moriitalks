import type { Locale } from '@/state/app-context';

export type VoiceSampleId = 'statement' | 'question' | 'pause' | 'list' | 'emphasis';
export type VoiceObservation = 'natural' | 'flat' | 'unclear';

interface VoiceSample {
  id: VoiceSampleId;
  title: string;
  text: string;
  focus: string;
}

// Fixed adult audition prompts compare delivery, they are not a validated speaking assessment.
const samples: Record<Locale, readonly [VoiceSample, ...VoiceSample[]]> = {
  id: [
    {
      id: 'statement',
      title: 'Pembukaan',
      text: 'Selamat pagi. Saya akan menjelaskan hasil percobaan kelompok kami.',
      focus: 'Apakah pembukaan dan penjelasan terdengar wajar, tanpa terburu-buru?',
    },
    {
      id: 'question',
      title: 'Pertanyaan',
      text: 'Apa yang perlu kita siapkan sebelum presentasi?',
      focus: 'Apakah kalimat terdengar sebagai pertanyaan, tanpa intonasi berlebihan?',
    },
    {
      id: 'pause',
      title: 'Jeda',
      text: 'Pertama, pilih satu topik. Setelah itu, tulis tiga poin yang ingin kamu jelaskan.',
      focus: 'Apakah jeda membantu pendengar membedakan kedua langkah?',
    },
    {
      id: 'list',
      title: 'Daftar',
      text: 'Untuk membuat poster, kita perlu kertas, pensil, dan penggaris.',
      focus: 'Apakah setiap benda terdengar jelas dan mudah dibedakan?',
    },
    {
      id: 'emphasis',
      title: 'Penekanan kata',
      text: 'Sampaikan satu ide utama agar penjelasanmu mudah diikuti.',
      focus: 'Apakah penekanan pada “satu ide utama” membantu memperjelas pesan?',
    },
  ],
  en: [
    {
      id: 'statement',
      title: 'Opening',
      text: 'Good morning. I will explain the results of our group experiment.',
      focus: 'Do the opening and explanation sound natural, without rushing?',
    },
    {
      id: 'question',
      title: 'Question',
      text: 'What do we need to prepare before the presentation?',
      focus: 'Does the sentence sound like a question, without exaggerated intonation?',
    },
    {
      id: 'pause',
      title: 'Pause',
      text: 'First, choose a topic. Then, write three points you want to explain.',
      focus: 'Do the pauses help the listener tell the two steps apart?',
    },
    {
      id: 'list',
      title: 'List',
      text: 'To make a poster, we need paper, a pencil, and a ruler.',
      focus: 'Is each item clear and easy to distinguish?',
    },
    {
      id: 'emphasis',
      title: 'Word emphasis',
      text: 'Share one main idea so your explanation is easy to follow.',
      focus: 'Does the emphasis on “one main idea” help make the message clear?',
    },
  ],
};

export function getVoiceSamples(locale: Locale) {
  return samples[locale];
}
