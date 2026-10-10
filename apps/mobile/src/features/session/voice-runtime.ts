import type { PreviewExample, VoiceLocale } from '@contracts/voice';

export type { PreviewExample, VoiceLocale } from '@contracts/voice';

// Allows plain HTTP only for local development, remote voice traffic must use TLS.
export function voiceEndpoints(configured: string | undefined, platform: string) {
  const fallback = platform === 'android' ? '10.0.2.2' : '127.0.0.1';
  const base = new URL(configured ?? `http://${fallback}:8080`);
  const local = ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'].includes(base.hostname);
  if (
    (base.protocol !== 'https:' && !(base.protocol === 'http:' && local)) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new Error('An HTTPS API address is required.');
  }
  const socket = new URL('/v1/voice', base);
  socket.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return { config: new URL('/v1/voice/config', base).href, socket: socket.href };
}

// Tracks event order and the active turn so stale replies cannot restart playback.
export class VoiceCursor {
  private sequence = 0;
  private turn = 0;
  private active: number | null = null;

  begin() {
    this.turn += 1;
    this.active = this.turn;
    return this.turn;
  }

  cancel(unstarted = false) {
    if (unstarted && this.active === this.turn) this.turn -= 1;
    this.active = null;
  }

  current() {
    return this.active;
  }

  accept(sequence: number, turnId?: number) {
    if (sequence <= this.sequence) return false;
    // Consume event order even when a cancelled turn's event is ignored.
    this.sequence = sequence;
    return turnId === undefined || turnId === this.active;
  }
}

// Buffers one bounded reply and verifies its declared size before playback.
export class AudioReply {
  private chunks: Uint8Array[] = [];
  private size = 0;

  append(data: ArrayBuffer) {
    if (data.byteLength === 0 || this.size + data.byteLength > 512 * 1024) {
      throw new Error('Audio response exceeds the supported size.');
    }
    this.chunks.push(new Uint8Array(data));
    this.size += data.byteLength;
  }

  finish(expectedBytes: number) {
    if (this.size === 0 || this.size !== expectedBytes) {
      throw new Error('Audio response is incomplete.');
    }
    const result = new Uint8Array(this.size);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.clear();
    return result;
  }

  clear() {
    this.chunks = [];
    this.size = 0;
  }
}

// Cumulative server acknowledgements bound how much captured audio can wait in transit.
export class AudioUpload {
  private sent = 0;
  private accepted = 0;

  reserve(bytes: number, sampleRate: number) {
    // Two seconds of mono 16-bit PCM can wait for server acceptance.
    if (this.sent - this.accepted + bytes > sampleRate * 4) {
      throw new Error('The audio connection is too slow.');
    }
    this.sent += bytes;
  }

  acknowledge(bytes: number) {
    if (bytes < this.accepted || bytes > this.sent) {
      throw new Error('Invalid audio acknowledgement.');
    }
    this.accepted = bytes;
  }
}

// Serializes native audio changes, skips stale work, and lets later work continue after failures.
export class AudioQueue {
  private pending = Promise.resolve();

  run(current: () => boolean, operation: () => Promise<void>) {
    const next = this.pending.then(async () => {
      if (current()) await operation();
    });
    this.pending = next.catch(() => undefined);
    return next;
  }
}

// Leaves time to commit the turn before the server's hard capture limit.
export function captureDurationMs(maxTurnSeconds: number) {
  return Math.max(100, (maxTurnSeconds - 1) * 1000);
}

// Downmixes signed little-endian 16-bit stereo PCM to the protocol's mono format.
export function monoPCM(data: ArrayBuffer, channels: number) {
  if ((channels !== 1 && channels !== 2) || data.byteLength % (channels * 2) !== 0) {
    throw new Error('Unsupported microphone format.');
  }
  if (channels === 1) return data;
  const input = new DataView(data);
  const output = new ArrayBuffer(data.byteLength / 2);
  const samples = new DataView(output);
  for (let offset = 0; offset < output.byteLength; offset += 2) {
    const left = input.getInt16(offset * 2, true);
    const right = input.getInt16(offset * 2 + 2, true);
    samples.setInt16(offset, Math.round((left + right) / 2), true);
  }
  return output;
}

// Scripted examples supply preview text without model evaluation or microphone input.
export function previewExample(locale: VoiceLocale, example: PreviewExample) {
  const examples = {
    id: {
      reason: {
        transcript:
          'Aku suka menggambar karena bisa membuat cerita. Contohnya, aku menggambar petualangan seekor kucing.',
        response:
          'Kamu menyebut alasan dan contoh. Coba jelaskan bagaimana contoh itu mendukung alasanmu.',
      },
      brief: {
        transcript: 'Aku suka menggambar.',
        response:
          'Pilihanmu sudah jelas. Tambahkan satu alasan. Coba mulai dengan: Aku suka menggambar karena…',
      },
    },
    en: {
      reason: {
        transcript:
          'I enjoy drawing because I can make stories. For example, I drew a cat on an adventure.',
        response:
          'You gave a reason and an example. Try explaining how the example supports your reason.',
      },
      brief: {
        transcript: 'I like drawing.',
        response:
          'Your choice is clear. Add one reason. Try starting with: I like drawing because…',
      },
    },
  };
  return examples[locale][example];
}
