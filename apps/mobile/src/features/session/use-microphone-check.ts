import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { MicrophoneCheck, emptyMicrophoneResult } from './microphone-check';
import type { MicrophoneResult } from './microphone-check';

async function prepareMicrophone() {
  await Speech.stop();
  if (AppState.currentState !== 'active') {
    throw new Error('The audio check is not in the foreground.');
  }
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: 'doNotMix',
  });
}

// Local adult diagnostics have no transport, files, progress awards, or retained audio buffers.
export function useMicrophoneCheck() {
  const supported = Platform.OS === 'android' || Platform.OS === 'ios';
  const focused = useRef(false);
  const [state, setState] = useState<MicrophoneResult>(emptyMicrophoneResult);
  const { stream } = useAudioStream({ sampleRate: 16000, channels: 1, encoding: 'int16' });
  const check = useMemo(
    () =>
      new MicrophoneCheck(
        {
          permission: async () => {
            const permission = await getRecordingPermissionsAsync();
            if (permission.granted || !permission.canAskAgain) return permission.granted;
            return (await requestRecordingPermissionsAsync()).granted;
          },
          prepare: prepareMicrophone,
          start: async () => {
            if (!supported) throw new Error('Native microphone capture is required.');
            await stream.start();
          },
          stop: () => {
            if (supported) stream.stop();
          },
          restore: async () => {
            if (supported)
              await setAudioModeAsync({
                allowsRecording: false,
                playsInSilentMode: true,
                shouldPlayInBackground: false,
                interruptionMode: 'doNotMix',
              });
          },
        },
        setState,
      ),
    [stream, supported],
  );

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setState(check.state);
      const background = AppState.addEventListener('change', (next) => {
        // The permission prompt may briefly make iOS inactive, backgrounding always cancels.
        if (next === 'background' || (next === 'inactive' && check.state.status !== 'permission')) {
          void check.cancel(next);
        }
      });
      const buffers = supported
        ? stream.addListener('audioStreamBuffer', (frame) => {
            check.receive(frame);
          })
        : null;
      const status = supported
        ? stream.addListener('audioStreamStatus', (event) => {
            if (!event.isStreaming) check.interrupted();
          })
        : null;
      return () => {
        focused.current = false;
        background.remove();
        buffers?.remove();
        status?.remove();
        void check.cancel();
      };
    }, [check, stream, supported]),
  );

  return {
    ...state,
    supported,
    start: async () => {
      if (supported && focused.current && AppState.currentState === 'active') await check.start();
    },
    stop: () => check.stop(),
  };
}
