import type {
  HarnessActionId,
  HarnessAnimation,
  HarnessCommand,
  HarnessEvent,
  HarnessPanel,
} from '@contracts/harness';
import type { VoiceLocale } from '@contracts/voice';

import { HarnessCursor } from './harness-runtime.ts';

export type DeviceTalkStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'paused'
  | 'error'
  | 'ended';

export interface DeviceTalkState {
  status: DeviceTalkStatus;
  connected: boolean;
  voiceActive: boolean;
  transcript: string;
  response: string;
  panel: HarnessPanel | null;
  animation: HarnessAnimation;
  responseId: string | null;
  responsePending: boolean;
  remainingTurns: number;
  error: string | null;
  firstResponseMs: number | null;
  metrics: Extract<HarnessEvent, { type: 'turn.metrics' }> | null;
}

export interface RecognitionCallbacks {
  started: () => void;
  result: (text: string, final: boolean) => void;
  ended: () => void;
  failed: (reason: 'empty' | 'permission' | 'unavailable') => void;
}

export interface RecognitionCapture {
  stop: () => void;
  abort: () => Promise<void>;
}

export interface RecognitionDriver {
  supported: boolean;
  permission: () => Promise<boolean>;
  recognize: (locale: VoiceLocale, callbacks: RecognitionCallbacks) => RecognitionCapture;
}

export interface DeviceTalkConnection {
  send: (command: HarnessCommand) => void;
  close: () => void;
}

interface PlaybackCallbacks {
  started: () => void;
  finished: () => void;
  failed: () => void;
}

export interface DeviceTalkDriver {
  connect: (
    signal: AbortSignal,
    callbacks: { event: (event: HarnessEvent) => void; failed: () => void },
  ) => Promise<DeviceTalkConnection>;
  permission: () => Promise<boolean>;
  recognize: (locale: VoiceLocale, callbacks: RecognitionCallbacks) => RecognitionCapture;
  speak: (text: string, locale: VoiceLocale, callbacks: PlaybackCallbacks) => void;
  stopSpeech: () => void;
}

const initialState: DeviceTalkState = {
  status: 'idle',
  connected: false,
  voiceActive: false,
  transcript: '',
  response: '',
  panel: null,
  animation: 'neutral',
  responseId: null,
  responsePending: false,
  remainingTurns: 8,
  error: null,
  firstResponseMs: null,
  metrics: null,
};

const messages = {
  id: {
    connection: 'Sambungan terputus. Mulai kembali saat siap.',
    permission: 'Mikrofon belum diizinkan. Kamu bisa mengetik pesan.',
    recognition: 'Ucapan belum bisa dikenali. Coba lagi atau ketik pesan.',
    empty: 'Ucapan belum terdengar jelas. Tekan mikrofon untuk mencoba lagi.',
    playback: 'Suara Morii belum bisa diputar. Baca jawabannya, lalu lanjutkan.',
    provider: 'Morii belum bisa menjawab. Coba bicara atau ketik lagi.',
    unsafe: 'Pesan ini belum bisa ditanggapi. Coba sampaikan maksudmu dengan cara lain.',
    timeout: 'Jawaban Morii terlalu lama. Coba bicara atau ketik lagi.',
    limit: 'Batas sesi tercapai. Mulai sesi baru setelah beristirahat.',
    protocol: 'Sesi belum bisa dilanjutkan. Mulai kembali saat siap.',
  },
  en: {
    connection: 'The connection stopped. Start again when ready.',
    permission: 'Microphone access is off. You can type a message.',
    recognition: 'Speech could not be recognized. Try again or type a message.',
    empty: 'Speech was unclear. Press the microphone to try again.',
    playback: 'Morii’s voice could not play. Read the reply, then continue.',
    provider: 'Morii could not reply. Try speaking or typing again.',
    unsafe: 'This message could not be answered. Try explaining what you mean another way.',
    timeout: 'Morii’s reply took too long. Try speaking or typing again.',
    limit: 'This session reached its limit. Rest before starting another session.',
    protocol: 'This session could not continue. Start again when ready.',
  },
};

// One owner serializes recognition, model turns, and playback, cancelled callbacks cannot rearm it.
export class DeviceTalkSession {
  private state = { ...initialState };
  private cursor = new HarnessCursor();
  private epoch = 0;
  private captureEpoch = 0;
  private playbackEpoch = 0;
  private connection: DeviceTalkConnection | null = null;
  private request: AbortController | null = null;
  private capture: RecognitionCapture | null = null;
  private captureDrain = Promise.resolve();
  private starting = false;
  private speaking = false;
  private serverReady = false;
  private remotePending = false;
  private playbackAllowed = true;
  private emptyRetries = 0;
  private committedAt: number | null = null;
  private turnSeconds = 30;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly locale: VoiceLocale;
  private readonly driver: DeviceTalkDriver;
  private readonly changed: (state: DeviceTalkState) => void;

  constructor(
    locale: VoiceLocale,
    driver: DeviceTalkDriver,
    changed: (state: DeviceTalkState) => void,
  ) {
    this.locale = locale;
    this.driver = driver;
    this.changed = changed;
  }

  snapshot() {
    return this.state;
  }

  private update(patch: Partial<DeviceTalkState>) {
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }

  private updateTranscript(transcript: string) {
    if (transcript !== this.state.transcript) this.update({ transcript });
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private after(milliseconds: number, operation: () => void) {
    this.clearTimer();
    this.timer = setTimeout(operation, milliseconds);
  }

  private stopCapture() {
    this.captureEpoch += 1;
    this.starting = false;
    const capture = this.capture;
    this.capture = null;
    if (capture !== null) {
      this.captureDrain = Promise.all([
        this.captureDrain,
        capture.abort().catch(() => undefined),
      ]).then(() => undefined);
    }
  }

  private stopPlayback() {
    this.playbackEpoch += 1;
    this.speaking = false;
    this.driver.stopSpeech();
  }

  private disconnect() {
    this.epoch += 1;
    this.request?.abort();
    this.request = null;
    this.stopCapture();
    this.stopPlayback();
    this.clearTimer();
    if (this.sessionTimer !== null) clearTimeout(this.sessionTimer);
    this.sessionTimer = null;
    this.connection?.close();
    this.connection = null;
    this.serverReady = false;
    this.remotePending = false;
    this.cursor.cancel();
  }

  private fail(reason: 'connection' | 'protocol') {
    this.disconnect();
    this.update({ ...initialState, status: 'error', error: messages[this.locale][reason] });
  }

  // A failed accepted turn keeps its admission count, retry requires a new explicit turn.
  private recoverTurn(reason: 'provider' | 'unsafe' | 'timeout') {
    this.clearTimer();
    this.stopCapture();
    this.stopPlayback();
    this.cursor.cancel();
    this.remotePending = false;
    this.serverReady = true;
    this.playbackAllowed = false;
    this.update({
      status: 'ready',
      voiceActive: false,
      response: '',
      panel: null,
      animation: 'neutral',
      responseId: null,
      responsePending: false,
      error: messages[this.locale][reason],
      firstResponseMs: null,
      metrics: null,
    });
  }

  async connect(voice: boolean) {
    this.disconnect();
    this.cursor = new HarnessCursor();
    this.emptyRetries = 0;
    this.playbackAllowed = true;
    const epoch = this.epoch;
    this.update({ ...initialState, status: 'connecting', voiceActive: voice });
    const request = new AbortController();
    this.request = request;
    this.after(8000, () => {
      this.fail('connection');
    });
    try {
      const connection = await this.driver.connect(request.signal, {
        event: (event) => {
          if (epoch === this.epoch) this.accept(event);
        },
        failed: () => {
          if (epoch === this.epoch) this.fail('connection');
        },
      });
      if (epoch !== this.epoch) {
        connection.close();
        return;
      }
      this.connection = connection;
      this.request = null;
      void this.listen();
    } catch {
      if (epoch === this.epoch) this.fail('connection');
    }
  }

  private accept(event: HarnessEvent) {
    if (!this.cursor.accept(event)) return;
    switch (event.type) {
      case 'session.ready':
        if (event.kind !== 'live') {
          this.fail('protocol');
          return;
        }
        this.clearTimer();
        this.serverReady = true;
        this.turnSeconds = event.limits.maxTurnSeconds;
        this.sessionTimer = setTimeout(() => {
          this.end();
        }, event.limits.maxSessionSeconds * 1000);
        this.update({ status: 'ready', connected: true, remainingTurns: event.limits.maxTurns });
        void this.listen();
        break;
      case 'transcript':
        this.updateTranscript(event.text);
        break;
      case 'turn.response':
        this.clearTimer();
        this.remotePending = false;
        this.update({
          response: event.text,
          panel: event.panel,
          animation: event.animation,
          responseId: event.responseId,
          responsePending: true,
        });
        if (this.playbackAllowed) this.play(event.text, event.responseId);
        break;
      case 'turn.state':
        if (event.state === 'ready') {
          this.serverReady = true;
          this.remotePending = false;
          if (!this.speaking) this.update({ status: 'ready' });
          void this.listen();
        }
        break;
      case 'turn.metrics':
        this.update({ metrics: event });
        break;
      case 'turn.cancelled':
        this.serverReady = true;
        this.remotePending = false;
        this.update({ status: 'ready' });
        break;
      case 'session.closed':
        this.end();
        break;
      case 'error':
        if (
          event.recoverable &&
          event.turnId === this.cursor.current() &&
          (event.code === 'provider' || event.code === 'unsafe' || event.code === 'timeout')
        ) {
          this.recoverTurn(event.code);
        } else {
          this.fail(event.code === 'invalid_message' ? 'protocol' : 'connection');
        }
        break;
      case 'audio.start':
      case 'audio.end':
      case 'turn.audio.accepted':
        this.fail('protocol');
        break;
    }
  }

  private async listen() {
    if (
      !this.state.voiceActive ||
      !this.serverReady ||
      this.state.responsePending ||
      this.state.panel !== null ||
      this.connection === null ||
      this.capture !== null ||
      this.starting ||
      this.speaking
    )
      return;
    if (this.state.remainingTurns === 0) {
      this.update({ voiceActive: false, error: messages[this.locale].limit });
      return;
    }
    const epoch = this.epoch;
    const captureEpoch = ++this.captureEpoch;
    const current = () => epoch === this.epoch && captureEpoch === this.captureEpoch;
    this.starting = true;
    this.update({ status: 'connecting', error: null });
    this.after(8000, () => {
      if (current()) this.recognitionFailed('unavailable');
    });
    try {
      await this.captureDrain;
      if (!current()) return;
      const permitted = await this.driver.permission();
      if (!current()) return;
      if (!permitted) {
        this.recognitionFailed('permission');
        return;
      }
      let finalText = '';
      let stopping = false;
      this.capture = this.driver.recognize(this.locale, {
        started: () => {
          if (!current()) return;
          this.starting = false;
          this.update({ status: 'listening' });
          this.after(this.turnSeconds * 1000, () => {
            if (current()) this.finishVoice();
          });
        },
        result: (text, final) => {
          if (!current() || stopping) return;
          const normalized = text.trim();
          this.updateTranscript(normalized.slice(0, 1000));
          if (!final) return;
          finalText = normalized;
          stopping = true;
          try {
            this.capture?.stop();
          } catch {
            this.recognitionFailed('unavailable');
            return;
          }
          this.after(5000, () => {
            if (current()) this.recognitionFailed('empty');
          });
        },
        ended: () => {
          if (!current()) return;
          this.clearTimer();
          this.capture = null;
          this.starting = false;
          this.captureEpoch += 1;
          if (finalText === '' || finalText.length > 1000) {
            this.recognitionFailed('empty');
            return;
          }
          this.emptyRetries = 0;
          this.sendTurn({ type: 'text', text: finalText });
        },
        failed: (reason) => {
          if (current()) this.recognitionFailed(reason);
        },
      });
    } catch {
      if (current()) this.recognitionFailed('unavailable');
    }
  }

  private recognitionFailed(reason: 'empty' | 'permission' | 'unavailable') {
    this.clearTimer();
    this.stopCapture();
    if (reason === 'empty' && this.state.voiceActive && this.emptyRetries === 0) {
      this.emptyRetries += 1;
      this.update({ status: 'ready' });
      void this.listen();
      return;
    }
    this.update({
      status: 'ready',
      voiceActive: false,
      error:
        messages[this.locale][
          reason === 'permission' ? 'permission' : reason === 'empty' ? 'empty' : 'recognition'
        ],
    });
  }

  finishVoice() {
    if (this.capture === null) return;
    try {
      this.capture.stop();
    } catch {
      this.recognitionFailed('unavailable');
      return;
    }
    this.after(5000, () => {
      this.recognitionFailed('empty');
    });
  }

  private sendTurn(
    input: { type: 'text'; text: string } | { type: 'action'; actionId: HarnessActionId },
  ) {
    if (!this.serverReady || this.connection === null || this.speaking || this.remotePending)
      return;
    if (this.state.responsePending) return;
    if (input.type === 'action' && input.actionId === 'end_session') {
      this.end();
      return;
    }
    if (input.type === 'text' && (input.text.trim() === '' || input.text.trim().length > 1000))
      return;
    const previousReply = this.cursor.reply();
    if (input.type === 'action' && previousReply === null) return;
    if (this.state.remainingTurns <= 0) {
      this.update({ voiceActive: false, error: messages[this.locale].limit });
      return;
    }
    const turnId = this.cursor.begin();
    const generation = this.cursor.generation();
    this.serverReady = false;
    this.remotePending = true;
    this.playbackAllowed = true;
    this.committedAt = Date.now();
    this.update({
      status: 'thinking',
      transcript: input.type === 'text' ? input.text.trim() : '',
      response: '',
      panel: null,
      animation: 'think',
      responseId: null,
      responsePending: false,
      remainingTurns: this.state.remainingTurns - 1,
      error: null,
      metrics: null,
      firstResponseMs: null,
    });
    try {
      if (input.type === 'text') {
        this.connection.send({
          version: 2,
          type: 'turn.text',
          turnId,
          generation,
          text: input.text.trim(),
        });
      } else if (previousReply !== null) {
        this.connection.send({
          version: 2,
          type: 'turn.action',
          turnId,
          generation,
          responseId: previousReply,
          actionId: input.actionId,
        });
      }
      this.after(30000, () => {
        this.fail('connection');
      });
    } catch {
      this.fail('connection');
    }
  }

  private play(text: string, responseId: string) {
    const epoch = this.epoch;
    const playbackEpoch = ++this.playbackEpoch;
    const current = () =>
      epoch === this.epoch &&
      playbackEpoch === this.playbackEpoch &&
      this.cursor.reply() === responseId;
    let started = false;
    this.speaking = true;
    this.after(8000, () => {
      if (current()) this.playbackFailed();
    });
    this.driver.speak(text, this.locale, {
      started: () => {
        if (!current()) return;
        started = true;
        this.update({
          status: 'speaking',
          firstResponseMs: this.committedAt === null ? null : Date.now() - this.committedAt,
        });
        this.after(30000, () => {
          if (current()) this.playbackFailed();
        });
      },
      finished: () => {
        if (!current()) return;
        if (!started) {
          this.playbackFailed();
          return;
        }
        this.clearTimer();
        this.speaking = false;
        this.playbackEpoch += 1;
        this.acknowledge();
        if (epoch !== this.epoch) return;
        this.update({ status: this.serverReady ? 'ready' : 'thinking' });
        void this.listen();
      },
      failed: () => {
        if (current()) this.playbackFailed();
      },
    });
  }

  private playbackFailed() {
    this.clearTimer();
    this.stopPlayback();
    this.update({ status: 'ready', voiceActive: false, error: messages[this.locale].playback });
  }

  private acknowledge() {
    const turnId = this.cursor.current();
    const responseId = this.cursor.reply();
    if (!this.state.responsePending || turnId === null || responseId === null) return;
    try {
      this.connection?.send({
        version: 2,
        type: 'response.played',
        turnId,
        generation: this.cursor.generation(),
        responseId,
      });
      this.update({ responsePending: false, error: null });
    } catch {
      this.fail('connection');
    }
  }

  continueText() {
    if (!this.serverReady || this.speaking) return;
    this.acknowledge();
  }

  submitText(text: string) {
    this.pause();
    this.sendTurn({ type: 'text', text });
  }

  act(actionId: HarnessActionId) {
    if (actionId === 'end_session') {
      this.end();
      return;
    }
    if (this.capture !== null || this.starting) return;
    this.sendTurn({ type: 'action', actionId });
  }

  dismissPanel() {
    const responseId = this.cursor.reply();
    if (!this.serverReady || responseId === null) return;
    try {
      this.connection?.send({
        version: 2,
        type: 'panel.dismiss',
        generation: this.cursor.generation(),
        responseId,
      });
      this.update({ panel: null });
      void this.listen();
    } catch {
      this.fail('connection');
    }
  }

  pause() {
    if (!this.remotePending) this.clearTimer();
    this.stopCapture();
    this.stopPlayback();
    this.playbackAllowed = false;
    this.update({ voiceActive: false, status: this.serverReady ? 'ready' : this.state.status });
  }

  resume() {
    if (this.connection === null || !this.serverReady || this.state.responsePending) return;
    this.playbackAllowed = true;
    this.emptyRetries = 0;
    this.update({ voiceActive: true, error: null });
    void this.listen();
  }

  startVoice() {
    this.resume();
  }

  interrupt() {
    this.pause();
    this.clearTimer();
    if (!this.remotePending && !this.state.responsePending) return;
    const turnId = this.cursor.current();
    try {
      if (turnId !== null)
        this.connection?.send({
          version: 2,
          type: 'turn.cancel',
          turnId,
          generation: this.cursor.generation(),
        });
    } catch {
      this.fail('connection');
      return;
    }
    this.cursor.cancel();
    this.remotePending = false;
    this.serverReady = true;
    this.update({
      status: 'ready',
      response: '',
      panel: null,
      responseId: null,
      responsePending: false,
      animation: 'neutral',
    });
  }

  end() {
    this.disconnect();
    this.update({ ...initialState, status: 'ended' });
  }
}
