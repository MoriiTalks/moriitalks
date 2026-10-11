import { AudioQueue } from './voice-runtime.ts';

export interface MicrophoneFrame {
  data: ArrayBuffer;
  channels: number;
  sampleRate: number;
}

export interface MicrophonePort {
  permission: () => Promise<boolean>;
  prepare: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => void;
  restore: () => Promise<void>;
}

export type MicrophoneStatus =
  | 'idle'
  | 'permission'
  | 'starting'
  | 'listening'
  | 'stopping'
  | 'complete'
  | 'cancelled'
  | 'denied'
  | 'failed';

export interface MicrophoneResult {
  status: MicrophoneStatus;
  cancelledBy: 'background' | 'inactive' | 'navigation' | null;
  level: number;
  peak: number;
  seconds: number;
  sampleRate: number | null;
  received: boolean;
}

export const emptyMicrophoneResult: MicrophoneResult = {
  status: 'idle',
  cancelledBy: null,
  level: 0,
  peak: 0,
  seconds: 0,
  sampleRate: null,
  received: false,
};

// Consume signed PCM without retaining it, these levels describe input rather than speech quality.
export function measureMicrophoneFrame({ data, channels, sampleRate }: MicrophoneFrame) {
  if (
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 48000 ||
    (channels !== 1 && channels !== 2) ||
    data.byteLength % (channels * 2) !== 0 ||
    data.byteLength > sampleRate * channels * 2
  )
    throw new Error('Unsupported microphone format.');
  if (data.byteLength === 0) return null;
  const view = new DataView(data);
  let peak = 0;
  let squared = 0;
  for (let offset = 0; offset < data.byteLength; offset += 2) {
    const sample = view.getInt16(offset, true) / 32768;
    peak = Math.max(peak, Math.abs(sample));
    squared += sample * sample;
  }
  return {
    level: Math.sqrt(squared / (data.byteLength / 2)),
    peak,
    seconds: data.byteLength / (channels * 2 * sampleRate),
  };
}

// Owns one bounded local check, cancelled setup must settle before native audio is reused.
export class MicrophoneCheck {
  state: MicrophoneResult = { ...emptyMicrophoneResult };
  private generation = 0;
  private capturing = false;
  private channels = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue = new AudioQueue();
  private port: MicrophonePort;
  private changed: (state: MicrophoneResult) => void;

  constructor(port: MicrophonePort, changed: (state: MicrophoneResult) => void) {
    this.port = port;
    this.changed = changed;
  }

  private update(patch: Partial<MicrophoneResult>) {
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }

  private clearTimer() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  async start() {
    if (['permission', 'starting', 'listening', 'stopping'].includes(this.state.status)) return;
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    this.channels = 0;
    this.update({ ...emptyMicrophoneResult, status: 'permission' });
    try {
      const granted = await this.port.permission();
      if (!current()) return;
      if (!granted) {
        this.update({ status: 'denied' });
        return;
      }
      this.update({ status: 'starting' });
      this.timer = setTimeout(() => {
        void this.finish('failed');
      }, 8000);
      await this.queue.run(current, async () => {
        await this.port.prepare();
        if (!current()) return;
        this.capturing = true;
        await this.port.start();
        if (!current()) {
          this.port.stop();
          return;
        }
        this.clearTimer();
        this.update({ status: 'listening' });
        this.timer = setTimeout(() => {
          void this.finish('complete');
        }, 6000);
      });
    } catch {
      if (current()) await this.finish('failed');
    }
  }

  receive(frame: MicrophoneFrame) {
    if (!this.capturing) return;
    try {
      const measurement = measureMicrophoneFrame(frame);
      if (!measurement) return;
      if (
        this.state.received &&
        (frame.sampleRate !== this.state.sampleRate || frame.channels !== this.channels)
      ) {
        throw new Error('The microphone format changed during capture.');
      }
      this.channels = frame.channels;
      this.update({
        received: true,
        sampleRate: frame.sampleRate,
        seconds: this.state.seconds + measurement.seconds,
        peak: Math.max(this.state.peak, measurement.peak),
        level: measurement.level,
      });
    } catch {
      void this.finish('failed');
    }
  }

  interrupted() {
    if (this.capturing && this.state.status === 'listening') void this.finish('failed');
  }

  stop() {
    return this.finish('complete');
  }
  cancel(reason: NonNullable<MicrophoneResult['cancelledBy']> = 'navigation') {
    return this.finish('cancelled', reason);
  }

  private async finish(
    status: 'complete' | 'cancelled' | 'failed',
    cancelledBy: MicrophoneResult['cancelledBy'] = null,
  ) {
    if (!['permission', 'starting', 'listening'].includes(this.state.status)) return;
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    this.capturing = false;
    this.clearTimer();
    this.update({ status: 'stopping', level: 0, cancelledBy });
    let failed = false;
    try {
      this.port.stop();
    } catch {
      failed = true;
    }
    try {
      await this.queue.run(current, async () => {
        // A pending native start may complete after the immediate stop above.
        try {
          this.port.stop();
        } finally {
          await this.port.restore();
        }
      });
    } catch {
      failed = true;
    }
    if (current()) this.update({ status: failed ? 'failed' : status });
  }
}
