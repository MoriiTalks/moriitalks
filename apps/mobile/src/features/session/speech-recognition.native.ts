import { requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import type { RecognitionDriver } from './device-talk-session';

const recognition =
  requireOptionalNativeModule<typeof ExpoSpeechRecognitionModule>('ExpoSpeechRecognition');

let blocked = false;

// End events drain the old native recognizer before another capture can own its callbacks.
export const speechRecognition: RecognitionDriver = {
  supported: recognition?.isRecognitionAvailable() ?? false,
  permission: async () => {
    if (!recognition?.isRecognitionAvailable()) return false;
    if (blocked) {
      if ((await recognition.getStateAsync()) !== 'inactive') return false;
      blocked = false;
    }
    return (await recognition.requestPermissionsAsync()).granted;
  },
  recognize: (locale, callbacks) => {
    if (recognition === null || blocked) throw new Error('Speech recognition is unavailable.');
    let cancelled = false;
    let ended = false;
    let ending = false;
    let complete: () => void = () => undefined;
    const completion = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const listeners: { remove: () => void }[] = [];
    listeners.push(
      recognition.addListener('start', () => {
        if (!cancelled) callbacks.started();
      }),
      recognition.addListener('result', (event) => {
        if (event.isFinal) ending = true;
        if (!cancelled) callbacks.result(event.results[0]?.transcript ?? '', event.isFinal);
      }),
      recognition.addListener('error', (event) => {
        ending = true;
        if (cancelled) return;
        callbacks.failed(
          event.error === 'no-speech' || event.error === 'speech-timeout'
            ? 'empty'
            : event.error === 'not-allowed'
              ? 'permission'
              : 'unavailable',
        );
      }),
      recognition.addListener('nomatch', () => {
        ending = true;
        if (!cancelled) callbacks.failed('empty');
      }),
      recognition.addListener('end', () => {
        ended = true;
        for (const listener of listeners) listener.remove();
        complete();
        if (!cancelled) callbacks.ended();
      }),
    );
    try {
      recognition.start({
        lang: locale === 'id' ? 'id-ID' : 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        // The OS speech service may use its network, this PoC does not promise offline capture.
        requiresOnDeviceRecognition: false,
        recordingOptions: { persist: false },
      });
    } catch (error) {
      for (const listener of listeners) listener.remove();
      throw error;
    }
    return {
      stop: () => {
        if (!ended && !ending && !cancelled) {
          ending = true;
          try {
            recognition.stop();
          } catch (error) {
            ending = false;
            throw error;
          }
        }
      },
      abort: async () => {
        if (ended) return;
        cancelled = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          if (!ending) recognition.abort();
          await Promise.race([
            completion,
            new Promise<void>((resolve) => {
              timer = setTimeout(() => {
                blocked = true;
                resolve();
              }, 2000);
            }),
          ]);
        } catch {
          blocked = true;
        } finally {
          if (timer !== undefined) clearTimeout(timer);
          for (const listener of listeners) listener.remove();
        }
      },
    };
  },
};
