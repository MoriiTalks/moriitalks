import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioStream,
} from 'expo-audio';
import type { AudioStreamBuffer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { parseVoiceConfig, parseVoiceEvent } from '@contracts/voice';
import type { VoiceCommand, VoiceEvent, VoiceKind, VoiceMode, VoiceTopic } from '@contracts/voice';

import {
  AudioQueue,
  AudioReply,
  AudioUpload,
  VoiceCursor,
  captureDurationMs,
  monoPCM,
  previewExample,
  voiceEndpoints,
} from './voice-runtime';
import type { PreviewExample, VoiceLocale } from './voice-runtime';

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

type VoiceMetrics = Extract<VoiceEvent, { type: 'turn.metrics' }>;

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
}
interface Runtime {
  mounted: boolean;
  // Async completions must match the generation after session or turn work is invalidated.
  generation: number;
  cursor: VoiceCursor;
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
  audio: AudioReply;
  file: File | null;
}
type Failure = 'connection' | 'disabled' | 'permission' | 'audio' | 'protocol' | 'limit' | 'unsafe';

const failures = {
  id: {
    connection: 'Sambungan terputus. Mikrofon sudah dimatikan. Coba lagi saat siap.',
    disabled: 'Uji suara belum tersedia. Kamu masih bisa mencoba contoh tanpa mikrofon.',
    permission: 'Mikrofon belum diizinkan. Kamu bisa mengizinkannya melalui pengaturan perangkat.',
    audio: 'Suara belum bisa diputar atau direkam. Mikrofon sudah dimatikan.',
    protocol: 'Sesi belum bisa dilanjutkan. Mikrofon sudah dimatikan. Coba mulai kembali.',
    limit: 'Batas sesi ini sudah tercapai. Berhenti sejenak sebelum sesi berikutnya.',
    unsafe: 'Morii belum bisa membantu topik ini. Kamu bisa mencoba cerita tentang hobi.',
  },
  en: {
    connection: 'The connection stopped. Your microphone is off. Try again when ready.',
    disabled: 'The voice test is unavailable. You can still try examples without a microphone.',
    permission: 'Microphone access is off. You can allow it in your device settings.',
    audio: 'Audio could not play or record. Your microphone is off.',
    protocol: 'This session could not continue. Your microphone is off. Try starting again.',
    limit: 'You reached this session’s limit. Take a break before your next session.',
    unsafe: 'Morii cannot help with this topic. You can try a story about a hobby.',
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
  });
  const runtime = useRef<Runtime>({
    mounted: true,
    generation: 0,
    cursor: new VoiceCursor(),
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
    audio: new AudioReply(),
    file: null,
  });
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const playback = useAudioPlayerStatus(player);

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
    current.audio.clear();
    current.outputTurn = null;
    current.playbackStarted = false;
    try {
      player.pause();
      player.replace(null);
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
    void Speech.stop().catch(() => undefined);
  }, [player]);

  const send = useCallback((message: VoiceCommand) => {
    const socket = runtime.current.socket;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  const close = useCallback(() => {
    const current = runtime.current;
    current.generation += 1;
    current.ready = false;
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
          socket.send(JSON.stringify({ type: 'session.close' }));
        socket.close();
      } catch {
        // Local capture and playback are already stopped if the transport has failed.
      }
    }
  }, [clearAudio, stopCapture]);

  const fail = useCallback(
    (failure: Failure) => {
      close();
      update({ status: 'error', error: failures[locale][failure] });
    },
    [close, locale, update],
  );

  const end = useCallback(() => {
    close();
    update({ status: 'ended', error: null });
  }, [close, update]);

  const interrupt = useCallback(() => {
    const current = runtime.current;
    const turnId = current.cursor.current();
    stopCapture();
    clearAudio();
    current.cursor.cancel(!current.announced);
    current.generation += 1;
    try {
      if (turnId && current.announced) send({ type: 'turn.cancel', turnId });
    } catch {
      fail('connection');
      return;
    }
    current.announced = false;
    current.ready = current.socket?.readyState === WebSocket.OPEN;
    update({ status: current.ready ? 'ready' : 'paused', firstResponseMs: null });
  }, [clearAudio, fail, send, stopCapture, update]);

  // Scripted text can use a local speech voice, this path never captures or sends audio.
  const startPreview = useCallback(
    async (example: PreviewExample) => {
      close();
      const generation = runtime.current.generation;
      const fixture = previewExample(locale, example);
      update({
        ...fixture,
        status: 'ready',
        kind: 'preview',
        error: null,
        firstResponseMs: null,
        metrics: null,
        remainingTurns: 8,
      });
      if (Platform.OS === 'android') return;
      try {
        await Speech.stop();
        const voices = await Speech.getAvailableVoicesAsync();
        const voice = voices.find((candidate) => {
          const language = candidate.language.toLowerCase().replace('_', '-');
          const local =
            Platform.OS === 'ios' ||
            ('localService' in candidate && candidate.localService === true);
          return local && (language === locale || language.startsWith(`${locale}-`));
        });
        if (!voice || generation !== runtime.current.generation || !runtime.current.mounted) return;
        const finish = () => {
          if (generation === runtime.current.generation) update({ status: 'ready' });
        };
        Speech.speak(fixture.response, {
          language: locale === 'id' ? 'id-ID' : 'en-US',
          voice: voice.identifier,
          rate: 0.9,
          pitch: 1,
          onStart() {
            if (generation === runtime.current.generation) update({ status: 'speaking' });
          },
          onDone: finish,
          onStopped: finish,
          onError: finish,
        });
      } catch {
        if (generation === runtime.current.generation) update({ status: 'ready' });
      }
    },
    [close, locale, update],
  );

  const playReply = useCallback(
    async (bytes: Uint8Array, turnId: number, generation: number) => {
      const current = runtime.current;
      const valid = () =>
        generation === current.generation && current.cursor.current() === turnId && current.mounted;
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
          player.replace({ uri: file.uri });
          player.play();
        });
      } catch {
        if (generation === runtime.current.generation) fail('audio');
      }
    },
    [fail, player],
  );

  const startLive = useCallback(async () => {
    close();
    if (Platform.OS === 'web') {
      fail('disabled');
      return;
    }
    const current = runtime.current;
    const generation = current.generation;
    current.cursor = new VoiceCursor();
    current.remainingTurns = 8;
    update({
      status: 'connecting',
      kind: 'live',
      transcript: '',
      response: '',
      error: null,
      firstResponseMs: null,
      metrics: null,
      remainingTurns: 8,
    });
    try {
      const endpoints = voiceEndpoints(process.env.EXPO_PUBLIC_VOICE_API_URL, Platform.OS);
      const request = new AbortController();
      current.request = request;
      current.timer = setTimeout(() => {
        if (generation === runtime.current.generation) fail('connection');
      }, 8000);
      const response = await fetch(endpoints.config, { signal: request.signal });
      const input: unknown = await response.json();
      if (generation !== runtime.current.generation || !current.mounted) return;
      const config = parseVoiceConfig(input);
      if (!response.ok || !config) {
        fail('protocol');
        return;
      }
      if (!config.liveEnabled) {
        fail('disabled');
        return;
      }
      const socket = new WebSocket(endpoints.socket);
      current.socket = socket;
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        if (current.socket !== socket) return;
        try {
          send({ type: 'session.start', version: 1, locale, mode, topic, adultConfirmed: true });
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
          const event = parseVoiceEvent(input);
          if (!event) {
            fail('protocol');
            return;
          }
          if (!current.cursor.accept(event.sequence, 'turnId' in event ? event.turnId : undefined))
            return;
          switch (event.type) {
            case 'session.ready':
              clearTimer();
              if (event.kind !== 'live') {
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
              update({ status: 'ready', kind: event.kind, remainingTurns: event.limits.maxTurns });
              break;
            case 'transcript':
              update({ transcript: event.text });
              break;
            case 'turn.response':
              update({ response: event.text });
              break;
            case 'turn.state':
              if (
                event.state !== 'listening' &&
                !current.recording &&
                (event.state !== 'ready' || current.outputTurn === null)
              ) {
                update({ status: event.state === 'speaking' ? 'thinking' : event.state });
              }
              break;
            case 'audio.start':
              current.audio.clear();
              current.outputTurn = event.turnId;
              break;
            case 'audio.end':
              clearTimer();
              void playReply(current.audio.finish(event.bytes), event.turnId, current.generation);
              break;
            case 'turn.cancelled':
              stopCapture();
              clearAudio();
              current.cursor.cancel();
              current.ready = true;
              update({ status: 'ready' });
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
  }, [
    clearAudio,
    clearTimer,
    close,
    end,
    fail,
    locale,
    mode,
    playReply,
    send,
    stopCapture,
    topic,
    update,
  ]);

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
      send({ type: 'turn.commit', turnId });
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
    if (!current.ready || current.recording || current.starting || current.outputTurn !== null)
      return;
    if (current.remainingTurns <= 0) {
      fail('limit');
      return;
    }
    const generation = current.generation;
    current.announced = false;
    const turnId = current.cursor.begin();
    const valid = () =>
      generation === current.generation && current.cursor.current() === turnId && current.mounted;
    current.starting = true;
    current.waitingForPermission = true;
    current.ready = false;
    update({
      status: 'connecting',
      transcript: '',
      response: '',
      error: null,
      firstResponseMs: null,
      metrics: null,
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
          type: 'turn.start',
          turnId,
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
        close();
        update({ status: 'paused', error: null });
      }
    });
    const listener = player.addListener('playbackStatusUpdate', (status) => {
      const current = runtime.current;
      if (current.outputTurn === null) return;
      if (status.error || status.mediaServicesDidReset) {
        fail('audio');
      } else if (status.didJustFinish) {
        clearAudio();
        current.ready = true;
        update({ status: 'ready' });
      } else if (status.playing) {
        current.playbackStarted = true;
        // Latency ends when playback begins, rather than when reply bytes arrive.
        if (current.committedAt !== null) {
          update({ firstResponseMs: Date.now() - current.committedAt });
          current.committedAt = null;
        }
      } else if (current.playbackStarted && !status.isBuffering) {
        close();
        update({ status: 'paused' });
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
      listener.remove();
      captureListener?.remove();
      bufferListener?.remove();
      close();
    };
  }, [clearAudio, close, fail, player, stream, update]);

  const status: VoiceStatus = playback.playing && state.kind === 'live' ? 'speaking' : state.status;
  return {
    ...state,
    status,
    startPreview,
    startLive,
    startTurn,
    commitTurn,
    interrupt,
    end,
  };
}
