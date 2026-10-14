import { setAudioModeAsync } from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { parseDeviceTalkConfig } from '@contracts/device-talk';
import { parseHarnessEvent } from '@contracts/harness';
import type { VoiceLocale, VoiceMode, VoiceTopic } from '@contracts/voice';

import { loadDeviceVoices, selectDeviceVoice } from '@/features/learning/device-voice';

import { DeviceTalkSession } from './device-talk-session';
import type { DeviceTalkConnection, DeviceTalkDriver } from './device-talk-session';
import * as Speech from './device-speech';
import { PreviewPlayback } from './preview-playback';
import { speechRecognition } from './speech-recognition';
import { AudioQueue, deviceTalkEndpoints } from './voice-runtime';

interface Options {
  locale: VoiceLocale;
  mode: VoiceMode;
  topic: VoiceTopic;
}

// Only this adapter touches native audio and sockets, the session rules remain independently testable.
function createDeviceRuntime({ locale, mode, topic }: Options) {
  const listeners = new Set<() => void>();
  const queue = new AudioQueue();
  let voices: readonly Speech.Voice[] = [];
  let voiceInventory = Promise.resolve<readonly Speech.Voice[]>([]);
  let speechEpoch = 0;
  let permissionActive = false;
  const playback = new PreviewPlayback({
    stop: Speech.stop,
    speak: (text, language, callbacks) => {
      const voice = selectDeviceVoice(voices, language === 'id-ID' ? 'id' : 'en');
      if (voice === undefined) {
        callbacks.failed();
        return;
      }
      Speech.speak(text, {
        language,
        voice: voice.identifier,
        rate: 0.95,
        onStart: callbacks.started,
        onDone: callbacks.finished,
        onError: callbacks.failed,
        onStopped: callbacks.failed,
      });
    },
  });
  const driver: DeviceTalkDriver = {
    connect: async (signal, callbacks) => {
      // A missing device voice must not prevent a typed Hermes conversation from connecting.
      voiceInventory = loadDeviceVoices(Speech.getAvailableVoicesAsync);
      const endpoints = deviceTalkEndpoints(process.env.EXPO_PUBLIC_VOICE_API_URL, Platform.OS);
      const response = await fetch(endpoints.config, { signal });
      const input: unknown = await response.json();
      const config = parseDeviceTalkConfig(input);
      if (!response.ok || !config?.enabled) {
        throw new Error('Device talk is unavailable.');
      }
      if (signal.aborted) throw new Error('Device talk was cancelled.');
      return new Promise<DeviceTalkConnection>((resolve, reject) => {
        const socket = new WebSocket(endpoints.socket);
        const close = () => {
          signal.removeEventListener('abort', aborted);
          socket.onopen = null;
          socket.onmessage = null;
          socket.onerror = null;
          socket.onclose = null;
          try {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ version: 2, type: 'session.close' }));
            }
            socket.close();
          } catch {
            // Native audio is stopped independently when the network cannot close cleanly.
          }
        };
        const aborted = () => {
          close();
          reject(new Error('Device talk was cancelled.'));
        };
        signal.addEventListener('abort', aborted, { once: true });
        socket.onopen = () => {
          if (signal.aborted) {
            aborted();
            return;
          }
          resolve({
            send: (command) => {
              if (socket.readyState !== WebSocket.OPEN)
                throw new Error('Device talk disconnected.');
              socket.send(JSON.stringify(command));
            },
            close,
          });
          socket.send(
            JSON.stringify({
              version: 2,
              type: 'session.start',
              locale,
              mode,
              topic,
              adultConfirmed: true,
            }),
          );
        };
        socket.onmessage = (message: { data: unknown }) => {
          try {
            if (typeof message.data !== 'string') throw new Error('Unexpected device audio.');
            const input: unknown = JSON.parse(message.data);
            const event = parseHarnessEvent(input);
            if (event === null) throw new Error('Invalid device talk event.');
            callbacks.event(event);
          } catch {
            callbacks.failed();
          }
        };
        const failed = () => {
          reject(new Error('Device talk disconnected.'));
          callbacks.failed();
        };
        socket.onerror = failed;
        socket.onclose = failed;
      });
    },
    permission: async () => {
      await queue.run(
        () => true,
        () => Promise.resolve(),
      );
      permissionActive = true;
      try {
        return await speechRecognition.permission();
      } finally {
        permissionActive = false;
      }
    },
    recognize: speechRecognition.recognize,
    speak: (text, language, callbacks) => {
      const epoch = ++speechEpoch;
      const inventory = voiceInventory;
      void queue
        .run(
          () => epoch === speechEpoch,
          async () => {
            let available = await inventory;
            if (epoch !== speechEpoch) return;
            // A browser may populate its voices after the initial connection inventory completed.
            if (selectDeviceVoice(available, language) === undefined) {
              available = await loadDeviceVoices(Speech.getAvailableVoicesAsync);
              if (epoch !== speechEpoch) return;
            }
            voices = available;
            await setAudioModeAsync({
              allowsRecording: false,
              playsInSilentMode: true,
              shouldPlayInBackground: false,
              interruptionMode: 'doNotMix',
            });
            if (epoch === speechEpoch) {
              playback.play(text, language === 'id' ? 'id-ID' : 'en-US', callbacks);
            }
          },
        )
        .catch(() => {
          if (epoch === speechEpoch) callbacks.failed();
        });
    },
    stopSpeech: () => {
      speechEpoch += 1;
      playback.stop();
    },
  };
  const session = new DeviceTalkSession(locale, driver, () => {
    for (const listener of listeners) listener();
  });
  return {
    session,
    permissionActive: () => permissionActive,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => session.snapshot(),
  };
}

export function useDeviceTalk({ locale, mode, topic }: Options) {
  const runtime = useMemo(
    () => createDeviceRuntime({ locale, mode, topic }),
    [locale, mode, topic],
  );
  const state = useSyncExternalStore(runtime.subscribe, runtime.snapshot, runtime.snapshot);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'background' || (next === 'inactive' && !runtime.permissionActive())) {
        runtime.session.end();
      }
    });
    return () => {
      listener.remove();
      runtime.session.end();
    };
  }, [runtime]);

  useFocusEffect(
    useCallback(
      () => () => {
        runtime.session.end();
      },
      [runtime],
    ),
  );

  const checkAvailability = useCallback(async () => {
    const request = new AbortController();
    const timer = setTimeout(() => {
      request.abort();
    }, 8000);
    try {
      const endpoints = deviceTalkEndpoints(process.env.EXPO_PUBLIC_VOICE_API_URL, Platform.OS);
      const response = await fetch(endpoints.config, { signal: request.signal });
      const input: unknown = await response.json();
      const config = parseDeviceTalkConfig(input);
      return response.ok && config !== null ? config.enabled : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }, []);

  return {
    ...state,
    recognitionSupported: speechRecognition.supported,
    checkAvailability,
    connect: (voice: boolean) => runtime.session.connect(voice),
    startVoice: () => {
      runtime.session.startVoice();
    },
    finishVoice: () => {
      runtime.session.finishVoice();
    },
    submitText: (text: string) => {
      runtime.session.submitText(text);
    },
    act: (action: Parameters<DeviceTalkSession['act']>[0]) => {
      runtime.session.act(action);
    },
    dismissPanel: () => {
      runtime.session.dismissPanel();
    },
    continueText: () => {
      runtime.session.continueText();
    },
    pause: () => {
      runtime.session.pause();
    },
    resume: () => {
      runtime.session.resume();
    },
    interrupt: () => {
      runtime.session.interrupt();
    },
    end: () => {
      runtime.session.end();
    },
  };
}
