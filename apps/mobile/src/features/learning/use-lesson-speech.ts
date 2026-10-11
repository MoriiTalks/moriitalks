import { useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { Locale } from '@/state/app-context';

import { selectDeviceVoice } from './device-voice';

type SpeechState = 'idle' | 'starting' | 'speaking' | 'unavailable';
type SpeechFailure = 'voice' | 'timeout' | 'playback';

function isForeground() {
  return AppState.currentState === 'active';
}

// Examples play only on request, route blur and backgrounding cancel queued device speech.
export function useLessonSpeech(locale: Locale) {
  const [state, setState] = useState<SpeechState>('idle');
  const [failure, setFailure] = useState<SpeechFailure | null>(null);
  const request = useRef(0);
  const focused = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancel = useCallback(() => {
    const current = ++request.current;
    clearTimeout(timeout.current);
    timeout.current = undefined;
    void Speech.stop().catch(() => {
      if (focused.current && request.current === current) {
        setFailure('playback');
        setState('unavailable');
      }
    });
  }, []);

  const stop = useCallback(() => {
    cancel();
    setFailure(null);
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
    setFailure(null);
    setState('starting');
    const active = () => focused.current && request.current === current;
    const fail = (reason: SpeechFailure) => {
      if (!active()) return;
      cancel();
      setFailure(reason);
      setState('unavailable');
    };
    // Missing browser/native callbacks must not leave an endless loading state.
    timeout.current = setTimeout(() => {
      fail('timeout');
    }, 8000);
    try {
      await Speech.stop();
      if (!active()) return;
      const voices = await Speech.getAvailableVoicesAsync();
      if (!active() || !isForeground()) return;
      const voice = selectDeviceVoice(voices, locale);
      if (!voice) {
        fail('voice');
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
        onError: () => {
          fail('playback');
        },
      });
    } catch {
      fail('playback');
    }
  }

  return { state, failure, play, stop };
}
