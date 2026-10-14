import { VoiceQuality } from 'expo-speech';
import type { Voice } from 'expo-speech';

import { createBrowserPlayback } from './browser-playback';
import type { BrowserPlaybackEnvironment, BrowserPlaybackUtterance } from './browser-playback';

function browserEnvironment(): BrowserPlaybackEnvironment | null {
  if (
    typeof window === 'undefined' ||
    !('speechSynthesis' in window) ||
    !('SpeechSynthesisUtterance' in window)
  )
    return null;
  const synthesis = window.speechSynthesis;
  return {
    getVoices: () =>
      synthesis.getVoices().map((voice) => ({
        identifier: voice.voiceURI,
        name: voice.name,
        language: voice.lang,
      })),
    addVoicesListener: (listener) => {
      synthesis.addEventListener('voiceschanged', listener);
    },
    removeVoicesListener: (listener) => {
      synthesis.removeEventListener('voiceschanged', listener);
    },
    create: (text, voice, language, rate) => {
      const selected = synthesis
        .getVoices()
        .find((candidate) => candidate.voiceURI === voice.identifier);
      if (selected === undefined) throw new Error('The selected browser voice is unavailable.');
      const native = new SpeechSynthesisUtterance(text);
      native.voice = selected;
      native.lang = language;
      native.rate = rate;
      const utterance: BrowserPlaybackUtterance = {
        onstart: null,
        onend: null,
        onerror: null,
        speak: () => {
          native.onstart = () => utterance.onstart?.();
          native.onend = () => utterance.onend?.();
          native.onerror = () => utterance.onerror?.();
          synthesis.speak(native);
        },
        clearHandlers: () => {
          native.onstart = null;
          native.onend = null;
          native.onerror = null;
        },
      };
      return utterance;
    },
    cancel: () => {
      synthesis.cancel();
    },
  };
}

const playback = createBrowserPlayback(browserEnvironment);

export type { Voice } from 'expo-speech';
export const getAvailableVoicesAsync = async (): Promise<Voice[]> =>
  (await playback.getAvailableVoicesAsync()).map((voice) => ({
    ...voice,
    quality: VoiceQuality.Default,
  }));
export const speak = playback.speak;
export const stop = playback.stop;
