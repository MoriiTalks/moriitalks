import assert from 'node:assert/strict';
import { test } from 'node:test';

import { startBrowserInputMeter } from './browser-input-meter.ts';
import type { BrowserInputAudio } from './browser-input-meter.ts';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function audioFixture() {
  let amplitude = 0;
  let reads = 0;
  let closes = 0;
  const audio: BrowserInputAudio = {
    read: (samples) => {
      reads += 1;
      samples.fill(amplitude);
      return true;
    },
    close: () => {
      closes += 1;
    },
  };
  return {
    audio,
    amplitude: (value: number) => {
      amplitude = value;
    },
    reads: () => reads,
    closes: () => closes,
  };
}

void test('the meter reports measured RMS at no more than ten updates per second', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const f = audioFixture();
  const levels: (number | null)[] = [];
  const stop = startBrowserInputMeter(
    (level) => levels.push(level),
    () => Promise.resolve(f.audio),
  );
  await tick();
  context.mock.timers.tick(99);
  assert.deepEqual(levels, []);
  context.mock.timers.tick(1);
  assert.deepEqual(levels, [0]);
  f.amplitude(0.25);
  context.mock.timers.tick(100);
  assert.deepEqual(levels, [0, 0.25]);
  f.amplitude(2);
  context.mock.timers.tick(100);
  assert.deepEqual(levels, [0, 0.25, 1]);
  stop();
  stop();
  context.mock.timers.tick(1000);
  assert.deepEqual(levels, [0, 0.25, 1, null]);
  assert.equal(f.reads(), 3);
  assert.equal(f.closes(), 1);
});

void test('cancelling a pending microphone request releases its late audio without publishing levels', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const f = audioFixture();
  const request = Promise.withResolvers<BrowserInputAudio>();
  const levels: (number | null)[] = [];
  const stop = startBrowserInputMeter(
    (level) => levels.push(level),
    () => request.promise,
  );
  await tick();
  stop();
  request.resolve(f.audio);
  await tick();
  context.mock.timers.tick(1000);
  assert.equal(f.closes(), 1);
  assert.equal(f.reads(), 0);
  assert.deepEqual(levels, [null]);
});

void test('cancelling immediately never starts a deferred microphone request', async () => {
  let requested = false;
  const stop = startBrowserInputMeter(
    () => undefined,
    () => {
      requested = true;
      return Promise.resolve(null);
    },
  );
  stop();
  await tick();
  assert.equal(requested, false);
});

for (const open of [
  () => Promise.resolve(null),
  () => Promise.reject(new Error('Microphone permission was denied.')),
]) {
  void test('unavailable microphone metering reports no invented volume', async () => {
    const levels: (number | null)[] = [];
    startBrowserInputMeter((level) => levels.push(level), open);
    await tick();
    assert.deepEqual(levels, [null]);
  });
}

void test('a suspended audio source stays unavailable until it supplies actual samples', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const levels: (number | null)[] = [];
  const stop = startBrowserInputMeter(
    (level) => levels.push(level),
    () =>
      Promise.resolve({
        read: () => false,
        close: () => undefined,
      }),
  );
  await tick();
  context.mock.timers.tick(100);
  assert.deepEqual(levels, [null]);
  stop();
});

void test('a failed sample releases its audio instead of leaving a live microphone', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let closed = false;
  const levels: (number | null)[] = [];
  startBrowserInputMeter(
    (level) => levels.push(level),
    () =>
      Promise.resolve({
        read: () => {
          throw new Error('Audio context closed.');
        },
        close: () => {
          closed = true;
        },
      }),
  );
  await tick();
  context.mock.timers.tick(100);
  assert.equal(closed, true);
  assert.deepEqual(levels, [null]);
});
