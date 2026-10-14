import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBrowserPlayback } from './browser-playback.ts';
import type {
  BrowserPlaybackEnvironment,
  BrowserPlaybackUtterance,
  BrowserPlaybackVoice,
} from './browser-playback.ts';

const indonesian = { identifier: 'id-voice', name: 'Indonesian', language: 'id-ID' };
const english = { identifier: 'en-voice', name: 'English', language: 'en-US' };

class FakeUtterance implements BrowserPlaybackUtterance {
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  enqueued = 0;
  cleared = 0;
  fails = false;

  speak() {
    if (this.fails) throw new Error('Playback failed');
    this.enqueued += 1;
  }
  clearHandlers() {
    this.cleared += 1;
  }
}

function fixture() {
  let voices: BrowserPlaybackVoice[] = [indonesian, english];
  const listeners = new Set<() => void>();
  const utterances: FakeUtterance[] = [];
  const selections: {
    text: string;
    voice: BrowserPlaybackVoice;
    language: string;
    rate: number;
  }[] = [];
  const events: string[] = [];
  let cancels = 0;
  let enqueueFails = false;
  const environment: BrowserPlaybackEnvironment = {
    getVoices: () => voices,
    addVoicesListener: (listener) => {
      listeners.add(listener);
    },
    removeVoicesListener: (listener) => {
      listeners.delete(listener);
    },
    create: (text, voice, language, rate) => {
      selections.push({ text, voice, language, rate });
      const utterance = new FakeUtterance();
      utterance.fails = enqueueFails;
      utterances.push(utterance);
      return utterance;
    },
    cancel: () => {
      cancels += 1;
    },
  };
  const playback = createBrowserPlayback(() => environment);
  const options = {
    language: 'id-ID',
    voice: 'id-voice',
    rate: 0.95,
    onStart: () => events.push('start'),
    onDone: () => events.push('done'),
    onStopped: () => events.push('stopped'),
    onError: () => events.push('error'),
  };
  function latest() {
    const utterance = utterances.at(-1);
    assert.ok(utterance);
    return utterance;
  }
  return {
    playback,
    options,
    events,
    listeners,
    utterances,
    selections,
    latest,
    cancels: () => cancels,
    setVoices: (value: BrowserPlaybackVoice[]) => {
      voices = value;
    },
    changed: () => {
      for (const listener of listeners) listener();
    },
    failEnqueue: () => {
      enqueueFails = true;
    },
  };
}

void test('available voices resolve immediately without changing a browser listener', async () => {
  const f = fixture();
  assert.deepEqual(await f.playback.getAvailableVoicesAsync(), [indonesian, english]);
  assert.equal(f.listeners.size, 0);
});

void test('voice discovery waits at most four seconds and retries an initially empty inventory', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  f.setVoices([]);
  const first = f.playback.getAvailableVoicesAsync();
  assert.equal(f.listeners.size, 1);
  f.changed();
  assert.equal(f.listeners.size, 1);
  context.mock.timers.tick(4000);
  assert.deepEqual(await first, []);
  assert.equal(f.listeners.size, 0);
  const second = f.playback.getAvailableVoicesAsync();
  f.setVoices([indonesian]);
  f.changed();
  assert.deepEqual(await second, [indonesian]);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.utterances.length, 0);
});

void test('concurrent voice discovery keeps separate removable listeners', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  f.setVoices([]);
  const first = f.playback.getAvailableVoicesAsync();
  const second = f.playback.getAvailableVoicesAsync();
  assert.equal(f.listeners.size, 2);
  f.setVoices([english]);
  f.changed();
  assert.deepEqual(await first, [english]);
  assert.deepEqual(await second, [english]);
  assert.equal(f.listeners.size, 0);
});

void test('speak chooses the current voice and enqueues before returning, stop cannot enqueue late', async () => {
  const f = fixture();
  f.playback.speak('Halo.', f.options);
  const utterance = f.latest();
  assert.equal(utterance.enqueued, 1);
  assert.deepEqual(f.selections, [
    { text: 'Halo.', voice: indonesian, language: 'id-ID', rate: 0.95 },
  ]);
  const lateStart = utterance.onstart;
  const lateEnd = utterance.onend;
  const stopping = f.playback.stop();
  assert.equal(f.cancels(), 1);
  assert.equal(utterance.onstart, null);
  assert.equal(utterance.onend, null);
  assert.equal(utterance.onerror, null);
  lateStart?.();
  lateEnd?.();
  await stopping;
  await Promise.resolve();
  assert.equal(utterance.enqueued, 1);
  assert.equal(f.utterances.length, 1);
  assert.deepEqual(f.events, ['stopped']);
});

void test('an empty inventory fails synchronously and never enqueues after voices appear', async () => {
  const f = fixture();
  f.setVoices([]);
  f.playback.speak('Halo.', f.options);
  assert.deepEqual(f.events, ['error']);
  await f.playback.stop();
  f.setVoices([indonesian]);
  f.changed();
  await Promise.resolve();
  assert.equal(f.utterances.length, 0);
});

void test('only one started current utterance may finish, old end or error cannot acknowledge its successor', () => {
  const f = fixture();
  f.playback.speak('Pertama.', f.options);
  const old = f.latest();
  const lateEnd = old.onend;
  const lateError = old.onerror;
  old.onstart?.();
  old.onstart?.();
  f.playback.speak('Kedua.', f.options);
  const current = f.latest();
  current.onstart?.();
  lateEnd?.();
  lateError?.();
  assert.deepEqual(f.events, ['start', 'stopped', 'start']);
  const duplicateEnd = current.onend;
  current.onend?.();
  duplicateEnd?.();
  assert.deepEqual(f.events, ['start', 'stopped', 'start', 'done']);
});

void test('errors, a finish without start, and synchronous enqueue failures never report success', () => {
  for (const failure of ['error', 'end', 'enqueue']) {
    const f = fixture();
    if (failure === 'enqueue') f.failEnqueue();
    f.playback.speak('Halo.', f.options);
    const utterance = f.latest();
    const lateEnd = utterance.onend;
    if (failure === 'error') utterance.onerror?.();
    if (failure === 'end') utterance.onend?.();
    lateEnd?.();
    assert.deepEqual(f.events, ['error']);
    assert.equal(utterance.onend, null);
  }
});

void test('unavailable browser speech returns an empty inventory and a bounded playback failure', async () => {
  const playback = createBrowserPlayback(() => null);
  assert.deepEqual(await playback.getAvailableVoicesAsync(), []);
  let failures = 0;
  playback.speak('Halo.', { onError: () => failures++ });
  assert.equal(failures, 1);
  await playback.stop();
});
