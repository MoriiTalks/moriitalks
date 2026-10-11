import {
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from 'expo-audio';
import type { AudioPlayer, AudioStreamBuffer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { parseHarnessConfig, parseHarnessEvent } from '@contracts/harness';
import type {
  HarnessActionId,
  HarnessAnimation,
  HarnessCommand,
  HarnessEvent,
  HarnessPanel,
} from '@contracts/harness';
import type { VoiceKind, VoiceMode, VoiceTopic } from '@contracts/voice';

import { HarnessCursor } from './harness-runtime';
import { PreviewPlayback } from './preview-playback';
import {
  AudioQueue,
  AudioReply,
  AudioUpload,
  captureDurationMs,
  monoPCM,
  voiceEndpoints,
} from './voice-runtime';
import type { VoiceLocale } from './voice-runtime';

type VoiceStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'paused'
  | 'error'
  | 'ended';

type VoiceMetrics = Extract<HarnessEvent, { type: 'turn.metrics' }>;

interface Options {
  locale: VoiceLocale;
  mode: VoiceMode;
  topic: VoiceTopic;
}
interface State {
  status: VoiceStatus;
  kind: VoiceKind;
  transcript: string;
  response: string;
  error: string | null;
  remainingTurns: number;
  firstResponseMs: number | null;
  metrics: VoiceMetrics | null;
  panel: HarnessPanel | null;
  animation: HarnessAnimation;
  responseId: string | null;
  responsePending: boolean;
}

// Closed sessions retain their status and quota display, their transient content is discarded.
const clearedContent: Pick<
  State,
  | 'transcript'
  | 'response'
  | 'firstResponseMs'
  | 'metrics'
  | 'panel'
  | 'animation'
  | 'responseId'
  | 'responsePending'
> = {
  transcript: '',
  response: '',
  firstResponseMs: null,
  metrics: null,
  panel: null,
  animation: 'neutral',
  responseId: null,
  responsePending: false,
};

interface Runtime {
  mounted: boolean;
  // Async completions must match the generation after session or turn work is invalidated.
  generation: number;
  cursor: HarnessCursor;
  kind: VoiceKind;
  responsePending: boolean;
  socket: WebSocket | null;
  request: AbortController | null;
  timer: ReturnType<typeof setTimeout> | null;
  sessionTimer: ReturnType<typeof setTimeout> | null;
  ready: boolean;
  recording: boolean;
  starting: boolean;
  waitingForPermission: boolean;
  announced: boolean;
  sampleRate: number;
  upload: AudioUpload;
  audioQueue: AudioQueue;
  maxTurnSeconds: number;
  remainingTurns: number;
  outputTurn: number | null;
  committedAt: number | null;
  playbackStarted: boolean;
  previewPlayback: boolean;
  player: AudioPlayer | null;
  removePlaybackListener: (() => void) | null;
  audio: AudioReply;
  file: File | null;
}
type Failure = 'connection' | 'disabled' | 'permission' | 'audio' | 'protocol' | 'limit' | 'unsafe';
type TextTurn = { type: 'text'; text: string } | { type: 'action'; actionId: HarnessActionId };

const failures = {
  id: {
    connection: 'Sambungan terputus. Mikrofon sudah dimatikan. Coba lagi saat siap.',
    disabled: 'Uji suara belum tersedia. Kamu masih bisa mencoba contoh tanpa mikrofon.',
    permission: 'Mikrofon belum diizinkan. Kamu bisa mengizinkannya melalui pengaturan perangkat.',
    audio: 'Suara belum bisa diputar atau direkam. Mikrofon sudah dimatikan.',
    protocol: 'Sesi belum bisa dilanjutkan. Mikrofon sudah dimatikan. Coba mulai kembali.',
    limit: 'Batas sesi ini sudah tercapai. Berhenti sejenak sebelum sesi berikutnya.',
    unsafe: 'Morii belum bisa membantu topik ini. Kita bisa berlatih menjelaskan ide sederhana.',
  },
  en: {
    connection: 'The connection stopped. Your microphone is off. Try again when ready.',
    disabled: 'The voice test is unavailable. You can still try examples without a microphone.',
    permission: 'Microphone access is off. You can allow it in your device settings.',
    audio: 'Audio could not play or record. Your microphone is off.',
    protocol: 'This session could not continue. Your microphone is off. Try starting again.',
    limit: 'You reached this session’s limit. Take a break before your next session.',
    unsafe: 'Morii cannot help with this topic. We can practice explaining a simple idea.',
  },
};

// Owns ephemeral preview and live state plus capture, playback, and transport cleanup.
export function useVoiceSession({ locale, mode, topic }: Options) {
  const [state, setState] = useState<State>({
    status: 'idle',
    kind: 'preview',
    transcript: '',
    response: '',
    error: null,
    remainingTurns: 8,
    firstResponseMs: null,
    metrics: null,
    panel: null,
    animation: 'neutral',
    responseId: null,
    responsePending: false,
  });
  const runtime = useRef<Runtime>({
    mounted: true,
    generation: 0,
    cursor: new HarnessCursor(),
    kind: 'preview',
    responsePending: false,
    socket: null,
    request: null,
    timer: null,
    sessionTimer: null,
    ready: false,
    recording: false,
    starting: false,
    waitingForPermission: false,
    announced: false,
    sampleRate: 0,
    upload: new AudioUpload(),
    audioQueue: new AudioQueue(),
    maxTurnSeconds: 30,
    remainingTurns: 8,
    outputTurn: null,
    committedAt: null,
    playbackStarted: false,
    previewPlayback: false,
    player: null,
    removePlaybackListener: null,
    audio: new AudioReply(),
    file: null,
  });
  const speechLocale = useRef(locale);
  const previewSpeech = useRef(
    new PreviewPlayback({
      stop: Speech.stop,
      speak: (text, language, callbacks) => {
        Speech.speak(text, {
          language,
          rate: 0.95,
          onStart: callbacks.started,
          onDone: callbacks.finished,
          onError: callbacks.failed,
          onStopped: callbacks.failed,
        });
      },
    }),
  );

  const update = useCallback((patch: Partial<State>) => {
    if (runtime.current.mounted) setState((previous) => ({ ...previous, ...patch }));
  }, []);

  const { stream } = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: 'int16',
  });

  const clearTimer = useCallback(() => {
    if (runtime.current.timer) clearTimeout(runtime.current.timer);
    runtime.current.timer = null;
  }, []);

  const stopCapture = useCallback(() => {
    runtime.current.recording = false;
    runtime.current.starting = false;
    runtime.current.waitingForPermission = false;
    if (Platform.OS !== 'web') {
      try {
        stream.stop();
      } catch {
        // Expo can release the capture stream before screen cleanup runs.
      }
    }
    clearTimer();
  }, [clearTimer, stream]);

  const clearAudio = useCallback(() => {
    const current = runtime.current;
    current.previewPlayback = false;
    previewSpeech.current.stop();
    current.audio.clear();
    current.outputTurn = null;
    current.playbackStarted = false;
    current.removePlaybackListener?.();
    current.removePlaybackListener = null;
    const player = current.player;
    current.player = null;
    try {
      player?.pause();
      player?.remove();
    } catch {
      // Expo can release the player before the screen cleanup runs.
    }
    const file = current.file;
    current.file = null;
    try {
      if (file?.exists) file.delete();
    } catch {
      // Only synthesized Morii replies use temporary files, captured audio stays in memory.
    }
  }, []);

  const send = useCallback((message: HarnessCommand) => {
    const socket = runtime.current.socket;
    if (socket?.readyState !== WebSocket.OPEN) throw new Error('The session is not connected.');
    socket.send(JSON.stringify(message));
  }, []);

  const close = useCallback(() => {
    const current = runtime.current;
    current.generation += 1;
    current.ready = false;
    current.responsePending = false;
    current.committedAt = null;
    current.request?.abort();
    current.request = null;
    stopCapture();
    clearAudio();
    current.cursor.cancel();
    if (current.sessionTimer) clearTimeout(current.sessionTimer);
    current.sessionTimer = null;
    if (current.socket) {
      const socket = current.socket;
      current.socket = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ version: 2, type: 'session.close' }));
        socket.close();
      } catch {
        // Local capture and playback are already stopped if the transport has failed.
      }
    }
  }, [clearAudio, stopCapture]);

  const fail = useCallback(
    (failure: Failure) => {
      close();
      update({
        ...clearedContent,
        status: 'error',
        error: failures[locale][failure],
      });
    },
    [close, locale, update],
  );

  const end = useCallback(() => {
    close();
    update({
      ...clearedContent,
      status: 'ended',
      error: null,
    });
  }, [close, update]);

  const pause = useCallback(() => {
    close();
    update({ ...clearedContent, status: 'paused', error: null });
  }, [close, update]);

  useEffect(() => {
    const previous = speechLocale.current;
    speechLocale.current = locale;
    if (previous !== locale) pause();
  }, [locale, pause]);

  // Stack routes can lose focus while mounted, capture and transport must stop at that boundary.
  useFocusEffect(
    useCallback(() => {
      return pause;
    }, [pause]),
  );

  const interrupt = useCallback(() => {
    const current = runtime.current;
    const turnId = current.cursor.current();
    stopCapture();
    clearAudio();
    current.cursor.cancel(!current.announced);
    current.generation += 1;
    try {
      if (turnId && current.announced)
        send({ version: 2, type: 'turn.cancel', turnId, generation: current.cursor.generation() });
    } catch {
      fail('connection');
      return;
    }
    current.announced = false;
    current.responsePending = false;
    current.ready = current.socket?.readyState === WebSocket.OPEN;
    update({
      status: current.ready ? 'ready' : 'paused',
      firstResponseMs: null,
      panel: null,
      response: '',
      responseId: null,
      responsePending: false,
      animation: 'neutral',
    });
  }, [clearAudio, fail, send, stopCapture, update]);

  // A reply enters conversation history only after playback, or explicit preview continuation.
  const acknowledgePlayed = useCallback(() => {
    const current = runtime.current;
    const turnId = current.cursor.current();
    const responseId = current.cursor.reply();
    if (!current.responsePending || turnId === null || responseId === null) return;
    try {
      send({
        version: 2,
        type: 'response.played',
        turnId,
        generation: current.cursor.generation(),
        responseId,
      });
      current.responsePending = false;
      update({ responsePending: false });
    } catch {
      fail('connection');
    }
  }, [fail, send, update]);

  const playPreview = useCallback(
    (text: string, responseId: string) => {
      const current = runtime.current;
      const generation = current.generation;
      const valid = () =>
        current.mounted &&
        generation === current.generation &&
        current.cursor.reply() === responseId &&
        current.previewPlayback;
      const unread = () => {
        if (!valid()) return;
        clearTimer();
        current.previewPlayback = false;
        current.ready = true;
        update({
          status: 'ready',
          error:
            locale === 'id'
              ? 'Suara contoh belum bisa diputar. Baca jawaban Morii untuk melanjutkan.'
              : 'The example voice could not play. Read Morii’s reply to continue.',
        });
      };
      current.previewPlayback = true;
      current.ready = false;
      clearTimer();
      const timedOut = () => {
        if (!valid()) return;
        unread();
        previewSpeech.current.stop();
      };
      current.timer = setTimeout(timedOut, 8000);
      previewSpeech.current.play(text, locale === 'id' ? 'id-ID' : 'en-US', {
        started: () => {
          if (!valid()) return;
          clearTimer();
          current.timer = setTimeout(timedOut, 30000);
          update({ status: 'speaking' });
        },
        finished: () => {
          if (!valid()) return;
          clearTimer();
          current.previewPlayback = false;
          acknowledgePlayed();
          if (generation !== current.generation) return;
          current.ready = current.socket?.readyState === WebSocket.OPEN;
          update({ status: current.ready ? 'ready' : 'paused' });
        },
        failed: unread,
      });
    },
    [acknowledgePlayed, clearTimer, locale, update],
  );

  const playReply = useCallback(
    async (bytes: Uint8Array, turnId: number, generation: number) => {
      const current = runtime.current;
      const responseId = current.cursor.reply();
      const valid = () =>
        generation === current.generation &&
        current.cursor.current() === turnId &&
        current.cursor.reply() === responseId &&
        current.mounted;
      try {
        await current.audioQueue.run(valid, async () => {
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
            shouldPlayInBackground: false,
            interruptionMode: 'doNotMix',
          });
          if (!valid()) return;
          const file = new File(
            Paths.cache,
            `morii-reply-${String(Date.now())}-${String(turnId)}.mp3`,
          );
          current.file = file;
          file.create();
          file.write(bytes);
          // A fresh player makes queued status events from older sources harmless.
          const player = createAudioPlayer({ uri: file.uri }, { updateInterval: 100 });
          current.player = player;
          current.playbackStarted = false;
          const listener = player.addListener('playbackStatusUpdate', (status) => {
            if (!valid() || current.player !== player) return;
            if (status.error || status.mediaServicesDidReset) {
              fail('audio');
            } else if (status.didJustFinish && current.playbackStarted) {
              clearTimer();
              acknowledgePlayed();
              clearAudio();
              if (current.socket?.readyState === WebSocket.OPEN) {
                current.ready = true;
                update({ status: 'ready' });
              }
            } else if (status.playing && !current.playbackStarted) {
              current.playbackStarted = true;
              clearTimer();
              current.timer = setTimeout(() => {
                if (valid()) fail('audio');
              }, 30000);
              update({
                status: 'speaking',
                firstResponseMs:
                  current.committedAt === null ? null : Date.now() - current.committedAt,
              });
              current.committedAt = null;
            } else if (
              !status.playing &&
              current.playbackStarted &&
              !status.isBuffering &&
              !(status.duration > 0 && status.currentTime >= status.duration - 0.15)
            ) {
              // iOS may report its final position before the separate completion event.
              pause();
            }
          });
          current.removePlaybackListener = () => {
            listener.remove();
          };
          clearTimer();
          current.timer = setTimeout(() => {
            if (valid()) fail('audio');
          }, 8000);
          player.play();
        });
      } catch {
        if (generation === runtime.current.generation) fail('audio');
      }
    },
    [acknowledgePlayed, clearAudio, clearTimer, fail, pause, update],
  );

  const requestTextTurn = useCallback(
    (input: TextTurn) => {
      const current = runtime.current;
      if (!current.ready || current.recording || current.starting || current.outputTurn !== null)
        return;
      if (input.type === 'action' && input.actionId === 'end_session') {
        end();
        return;
      }
      if (input.type === 'text' && (!input.text.trim() || input.text.trim().length > 1000)) return;
      const responseId = current.cursor.reply();
      if (input.type === 'action' && responseId === null) return;
      if (current.remainingTurns <= 0) {
        fail('limit');
        return;
      }
      if (current.kind === 'preview') acknowledgePlayed();
      if (current.socket?.readyState !== WebSocket.OPEN) return;
      current.generation += 1;
      const turnId = current.cursor.begin();
      const generation = current.cursor.generation();
      current.ready = false;
      current.announced = true;
      current.responsePending = false;
      current.remainingTurns -= 1;
      current.committedAt = Date.now();
      update({
        status: 'thinking',
        transcript: '',
        response: '',
        panel: null,
        responseId: null,
        responsePending: false,
        animation: 'think',
        error: null,
        remainingTurns: current.remainingTurns,
        metrics: null,
        firstResponseMs: null,
      });
      try {
        if (input.type === 'text') {
          send({ version: 2, type: 'turn.text', turnId, generation, text: input.text.trim() });
        } else if (responseId !== null) {
          send({
            version: 2,
            type: 'turn.action',
            turnId,
            generation,
            responseId,
            actionId: input.actionId,
          });
        }
        clearTimer();
        const epoch = current.generation;
        current.timer = setTimeout(() => {
          if (epoch === current.generation) fail('connection');
        }, 30000);
      } catch {
        fail('connection');
      }
    },
    [acknowledgePlayed, clearTimer, end, fail, send, update],
  );

  const submitText = useCallback(
    (text: string) => {
      requestTextTurn({ type: 'text', text });
    },
    [requestTextTurn],
  );

  const act = useCallback(
    (actionId: HarnessActionId) => {
      requestTextTurn({ type: 'action', actionId });
    },
    [requestTextTurn],
  );

  const dismissPanel = useCallback(() => {
    const current = runtime.current;
    const responseId = current.cursor.reply();
    if (!current.ready || responseId === null) return;
    try {
      send({
        version: 2,
        type: 'panel.dismiss',
        responseId,
        generation: current.cursor.generation(),
      });
      update({ panel: null });
    } catch {
      fail('connection');
    }
  }, [fail, send, update]);

  const connect = useCallback(
    async (kind: VoiceKind) => {
      close();
      if (kind === 'live' && Platform.OS === 'web') {
        fail('disabled');
        return;
      }
      const current = runtime.current;
      const generation = current.generation;
      current.cursor = new HarnessCursor();
      current.kind = kind;
      current.remainingTurns = 8;
      update({
        status: 'connecting',
        kind,
        transcript: '',
        response: '',
        error: null,
        firstResponseMs: null,
        metrics: null,
        remainingTurns: 8,
        panel: null,
        animation: 'neutral',
        responseId: null,
        responsePending: false,
      });
      try {
        const endpoints = voiceEndpoints(process.env.EXPO_PUBLIC_VOICE_API_URL, Platform.OS, 2);
        const request = new AbortController();
        current.request = request;
        current.timer = setTimeout(() => {
          if (generation === runtime.current.generation) fail('connection');
        }, 8000);
        const response = await fetch(endpoints.config, { signal: request.signal });
        const input: unknown = await response.json();
        if (generation !== runtime.current.generation || !current.mounted) return;
        const config = parseHarnessConfig(input);
        if (!response.ok || !config) {
          fail('protocol');
          return;
        }
        if (kind === 'live' && !config.liveEnabled) {
          fail('disabled');
          return;
        }
        const socket = new WebSocket(endpoints.socket);
        current.socket = socket;
        socket.binaryType = 'arraybuffer';
        socket.onopen = () => {
          if (current.socket !== socket) return;
          try {
            send({
              type: 'session.start',
              version: 2,
              locale,
              mode,
              topic,
              adultConfirmed: kind === 'live',
            });
          } catch {
            fail('connection');
          }
        };
        socket.onmessage = (message: { data: unknown }) => {
          if (runtime.current.socket !== socket) return;
          try {
            if (message.data instanceof ArrayBuffer) {
              if (current.outputTurn === current.cursor.current() && current.outputTurn !== null)
                current.audio.append(message.data);
              return;
            }
            if (typeof message.data !== 'string') {
              fail('protocol');
              return;
            }
            const input: unknown = JSON.parse(message.data);
            // Validate external messages before they can alter session or audio state.
            const event = parseHarnessEvent(input);
            if (!event) {
              fail('protocol');
              return;
            }
            if (!current.cursor.accept(event)) return;
            switch (event.type) {
              case 'session.ready':
                clearTimer();
                if (event.kind !== kind) {
                  fail('disabled');
                  break;
                }
                if (current.sessionTimer !== null) {
                  fail('protocol');
                  break;
                }
                current.ready = true;
                current.remainingTurns = event.limits.maxTurns;
                current.maxTurnSeconds = event.limits.maxTurnSeconds;
                current.sessionTimer = setTimeout(end, event.limits.maxSessionSeconds * 1000);
                update({
                  status: 'ready',
                  kind: event.kind,
                  remainingTurns: event.limits.maxTurns,
                });
                if (kind === 'preview') {
                  requestTextTurn({
                    type: 'text',
                    text:
                      locale === 'id'
                        ? mode === 'practice'
                          ? 'Bantu aku memulai latihan.'
                          : 'Halo, Morii.'
                        : mode === 'practice'
                          ? 'Help me start a practice.'
                          : 'Hi, Morii.',
                  });
                }
                break;
              case 'transcript':
                update({ transcript: event.text });
                break;
              case 'turn.response':
                current.responsePending = true;
                update({
                  response: event.text,
                  panel: event.panel,
                  animation: event.animation,
                  responseId: event.responseId,
                  responsePending: true,
                });
                if (kind === 'preview') playPreview(event.text, event.responseId);
                break;
              case 'turn.state':
                if (
                  event.state !== 'listening' &&
                  !current.recording &&
                  (event.state !== 'ready' ||
                    (current.outputTurn === null && !current.previewPlayback))
                ) {
                  if (event.state === 'ready') {
                    clearTimer();
                    current.ready = true;
                  }
                  update({ status: event.state === 'speaking' ? 'thinking' : event.state });
                }
                break;
              case 'audio.start':
                current.audio.clear();
                current.outputTurn = event.turnId;
                current.playbackStarted = false;
                break;
              case 'audio.end':
                void playReply(current.audio.finish(event.bytes), event.turnId, current.generation);
                break;
              case 'turn.cancelled':
                stopCapture();
                clearAudio();
                current.cursor.cancel();
                current.ready = true;
                current.responsePending = false;
                update({
                  status: 'ready',
                  panel: null,
                  responseId: null,
                  responsePending: false,
                  animation: 'neutral',
                });
                break;
              case 'error':
                fail(
                  event.code === 'limit'
                    ? 'limit'
                    : event.code === 'unsafe'
                      ? 'unsafe'
                      : 'connection',
                );
                break;
              case 'session.closed':
                end();
                break;
              case 'turn.metrics':
                update({ metrics: event });
                break;
              case 'turn.audio.accepted':
                current.upload.acknowledge(event.bytes);
                break;
            }
          } catch {
            fail('protocol');
          }
        };
        socket.onerror = () => {
          if (runtime.current.socket === socket) fail('connection');
        };
        socket.onclose = () => {
          if (runtime.current.socket === socket) fail('connection');
        };
      } catch {
        if (generation === runtime.current.generation) fail('connection');
      }
    },
    [
      clearAudio,
      clearTimer,
      close,
      end,
      fail,
      locale,
      mode,
      playReply,
      playPreview,
      requestTextTurn,
      send,
      stopCapture,
      topic,
      update,
    ],
  );

  const connectPreview = useCallback(() => connect('preview'), [connect]);
  const startLive = useCallback(() => connect('live'), [connect]);

  // Capability checks never connect a session, request microphone access, or start recording.
  const checkLiveAvailability = useCallback(async () => {
    close();
    const current = runtime.current;
    const generation = current.generation;
    update({ ...clearedContent, status: 'connecting', error: null });
    const request = new AbortController();
    current.request = request;
    current.timer = setTimeout(() => {
      request.abort();
    }, 8000);
    try {
      const endpoints = voiceEndpoints(process.env.EXPO_PUBLIC_VOICE_API_URL, Platform.OS, 2);
      const response = await fetch(endpoints.config, { signal: request.signal });
      const input: unknown = await response.json();
      if (generation !== current.generation || !current.mounted) return null;
      const config = parseHarnessConfig(input);
      if (!response.ok || config === null) throw new Error('Invalid voice configuration.');
      clearTimer();
      current.request = null;
      update({ status: 'idle' });
      return Platform.OS === 'web' ? 'unsupported' : config.liveEnabled ? 'available' : 'disabled';
    } catch {
      if (generation !== current.generation || !current.mounted) return null;
      fail('connection');
      return 'unreachable';
    }
  }, [clearTimer, close, fail, update]);

  const commitTurn = useCallback(async () => {
    const current = runtime.current;
    const turnId = current.cursor.current();
    if (!current.recording || !turnId) return;
    stopCapture();
    if (!current.announced) {
      fail('audio');
      return;
    }
    current.committedAt = Date.now();
    const generation = current.generation;
    update({ status: 'thinking' });
    try {
      send({ version: 2, type: 'turn.commit', turnId, generation: current.cursor.generation() });
      current.timer = setTimeout(() => {
        if (generation === runtime.current.generation) fail('connection');
      }, 30000);
      await current.audioQueue.run(
        () => generation === current.generation,
        async () => {
          await setAudioModeAsync({
            allowsRecording: false,
            shouldPlayInBackground: false,
            interruptionMode: 'doNotMix',
          });
        },
      );
    } catch {
      if (generation === runtime.current.generation) fail('audio');
    }
  }, [fail, send, stopCapture, update]);

  const startTurn = useCallback(async () => {
    const current = runtime.current;
    if (
      current.kind !== 'live' ||
      !current.ready ||
      current.recording ||
      current.starting ||
      current.outputTurn !== null
    )
      return;
    if (current.remainingTurns <= 0) {
      fail('limit');
      return;
    }
    current.generation += 1;
    const generation = current.generation;
    current.announced = false;
    const turnId = current.cursor.begin();
    const valid = () =>
      generation === current.generation && current.cursor.current() === turnId && current.mounted;
    current.starting = true;
    current.waitingForPermission = true;
    current.ready = false;
    current.responsePending = false;
    update({
      status: 'connecting',
      transcript: '',
      response: '',
      error: null,
      firstResponseMs: null,
      metrics: null,
      panel: null,
      animation: 'neutral',
      responseId: null,
      responsePending: false,
    });
    try {
      // Permission follows an explicit capture action, never the initial session connection.
      const permission = await requestRecordingPermissionsAsync();
      if (!valid()) return;
      current.waitingForPermission = false;
      if (!permission.granted) {
        fail('permission');
        return;
      }
      current.timer = setTimeout(() => {
        if (valid()) fail('audio');
      }, 8000);
      await current.audioQueue.run(valid, async () => {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          interruptionMode: 'doNotMix',
        });
        if (!valid()) return;
        current.sampleRate = 0;
        current.upload = new AudioUpload();
        current.recording = true;
        await stream.start();
        if (!valid() || !runtime.current.recording) {
          stream.stop();
          return;
        }
        current.starting = false;
        update({ status: 'listening' });
      });
    } catch {
      if (generation === runtime.current.generation) fail('audio');
    }
  }, [fail, stream, update]);

  const onBuffer = useEffectEvent((buffer: AudioStreamBuffer) => {
    const current = runtime.current;
    const socket = current.socket;
    const turnId = current.cursor.current();
    if (!current.recording || socket?.readyState !== WebSocket.OPEN || !turnId) return;
    try {
      if (
        !Number.isInteger(buffer.sampleRate) ||
        buffer.sampleRate < 8000 ||
        buffer.sampleRate > 48000 ||
        (current.announced && current.sampleRate !== buffer.sampleRate)
      ) {
        fail('audio');
        return;
      }
      const data = monoPCM(buffer.data, buffer.channels);
      if (data.byteLength === 0) return;
      try {
        current.upload.reserve(data.byteLength, buffer.sampleRate);
      } catch {
        fail('connection');
        return;
      }
      // Announce the actual microphone format and spend a turn on the first non-empty buffer.
      if (!current.announced) {
        current.announced = true;
        current.sampleRate = buffer.sampleRate;
        current.remainingTurns -= 1;
        send({
          version: 2,
          type: 'turn.start',
          turnId,
          generation: current.cursor.generation(),
          sampleRate: buffer.sampleRate,
          channels: 1,
          encoding: 'pcm_s16le',
        });
        clearTimer();
        current.timer = setTimeout(() => {
          void commitTurn();
        }, captureDurationMs(current.maxTurnSeconds));
        update({ status: 'listening', remainingTurns: current.remainingTurns });
      }
      socket.send(data);
    } catch {
      fail('audio');
    }
  });

  useEffect(() => {
    const activeRuntime = runtime.current;
    activeRuntime.mounted = true;
    const background = AppState.addEventListener('change', (next) => {
      // The OS permission dialog can briefly make the app inactive during capture setup.
      const waitingForPermission = activeRuntime.waitingForPermission;
      if (next === 'background' || (next === 'inactive' && !waitingForPermission)) {
        pause();
      }
    });
    const captureListener =
      Platform.OS === 'web'
        ? null
        : stream.addListener('audioStreamStatus', (status) => {
            if (!status.isStreaming && activeRuntime.recording && !activeRuntime.starting)
              fail('audio');
          });
    const bufferListener =
      Platform.OS === 'web'
        ? null
        : stream.addListener('audioStreamBuffer', (buffer) => {
            onBuffer(buffer);
          });
    return () => {
      activeRuntime.mounted = false;
      background.remove();
      captureListener?.remove();
      bufferListener?.remove();
      close();
    };
  }, [close, fail, pause, stream]);

  return {
    ...state,
    connectPreview,
    checkLiveAvailability,
    submitText,
    act,
    dismissPanel,
    startLive,
    startTurn,
    commitTurn,
    interrupt,
    end,
  };
}
