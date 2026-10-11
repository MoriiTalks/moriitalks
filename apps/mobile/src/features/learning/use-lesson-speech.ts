import { useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { Locale } from '@/state/app-context';

type SpeechState = 'idle' | 'starting' | 'speaking' | 'unavailable';

function isForeground() {
  return AppState.currentState === 'active';
}

// Examples play only on request, route blur and backgrounding cancel queued device speech.
export function useLessonSpeech(locale: Locale) {
  const [state, setState] = useState<SpeechState>('idle');
  const request = useRef(0);
  const focused = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancel = useCallback(() => {
    const current = ++request.current;
    clearTimeout(timeout.current);
    timeout.current = undefined;
    void Speech.stop().catch(() => {
      if (focused.current && request.current === current) setState('unavailable');
    });
  }, []);

  const stop = useCallback(() => {
    cancel();
    setState('idle');
  }, [cancel]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const listener = AppState.addEventListener('change', (next) => {
        if (next !== 'active') stop();
      });
      return () => {
        focused.current = false;
        cancel();
        listener.remove();
      };
    }, [cancel, stop]),
  );

  async function play(text: string) {
    if (!focused.current || !isForeground()) return;
    const current = ++request.current;
    clearTimeout(timeout.current);
    setState('starting');
    const active = () => focused.current && request.current === current;
    const fail = () => {
      if (!active()) return;
      cancel();
      setState('unavailable');
    };
    // Missing browser/native callbacks must not leave an endless loading state.
    timeout.current = setTimeout(fail, 8000);
    try {
      await Speech.stop();
      if (!active()) return;
      const voices = await Speech.getAvailableVoicesAsync();
      if (!active() || !isForeground()) return;
      const matching = voices.filter((voice) => voice.language.toLowerCase().startsWith(locale));
      const voice =
        matching.find((item) => item.quality === Speech.VoiceQuality.Enhanced) ?? matching[0];
      if (!voice) {
        fail();
        return;
      }
      Speech.speak(text, {
        language: locale === 'id' ? 'id-ID' : 'en-US',
        voice: voice.identifier,
        rate: 0.9,
        onStart: () => {
          if (!active()) return;
          clearTimeout(timeout.current);
          setState('speaking');
        },
        onDone: () => {
          if (!active()) return;
          clearTimeout(timeout.current);
          setState('idle');
        },
        onStopped: () => {
          if (!active()) return;
          clearTimeout(timeout.current);
          setState('idle');
        },
        onError: fail,
      });
    } catch {
      fail();
    }
  }

  return { state, play, stop };
}
