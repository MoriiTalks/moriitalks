import { useState } from 'react';

import { Morii } from '@/components/morii';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { BackButton } from '@/components/navigation';
import { Eyebrow, Heading, Note, Paragraph } from '@/components/typography';
import { useApp } from '@/state/app-context';

type Topic = 'hobby' | 'day';

const demo = {
  id: {
    greeting: 'Hai! Ingin cerita tentang apa?',
    hobby: 'Hal apa yang paling kamu suka dari hobimu? Coba ceritakan satu contoh.',
    day: 'Pilih satu hal yang terjadi hari ini. Apa yang membuatnya menarik?',
  },
  en: {
    greeting: 'Hi! What would you like to talk about?',
    hobby: 'What do you enjoy most about your hobby? Tell me one example.',
    day: 'Choose one thing that happened today. What made it interesting?',
  },
};

export function TalkScreen() {
  const [topic, setTopic] = useState<Topic | null>(null);
  const { locale } = useApp();
  const id = locale === 'id';
  const copy = demo[locale];
  return (
    <Screen>
      <BackButton />
      <Eyebrow>{id ? 'DEMO OBROLAN' : 'CHAT DEMO'}</Eyebrow>
      <Heading>{id ? 'Ada cerita apa?' : 'What’s your story?'}</Heading>
      <Morii pose="listen" size={260} />
      <Card>
        <Eyebrow>MORII</Eyebrow>
        <Paragraph>{topic ? copy[topic] : copy.greeting}</Paragraph>
      </Card>
      {!topic ? (
        <>
          <Button
            onPress={() => {
              setTopic('hobby');
            }}
          >
            {id ? 'Tentang hobiku' : 'About my hobby'}
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              setTopic('day');
            }}
          >
            {id ? 'Tentang hariku' : 'About my day'}
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          onPress={() => {
            setTopic(null);
          }}
        >
          {id ? 'Pilih topik lain' : 'Choose another topic'}
        </Button>
      )}
      <Note>
        {id
          ? 'Demo tertulis, belum menggunakan suara atau AI.'
          : 'A written demo, without voice or AI yet.'}
      </Note>
    </Screen>
  );
}
