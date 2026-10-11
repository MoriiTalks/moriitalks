import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MicrophoneCheck, measureMicrophoneFrame } from './microphone-check.ts';
import type { MicrophonePort } from './microphone-check.ts';

function pcm(values: readonly number[]) {
  const data = new ArrayBuffer(values.length * 2);
  const view = new DataView(data);
  values.forEach((value, index) => {
    view.setInt16(index * 2, value, true);
  });
  return data;
}

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve: (value: T) => resolve?.(value) };
}

function device() {
  const events: string[] = [];
  let capturing = false;
  const port: MicrophonePort = {
    permission: () => Promise.resolve(true),
    prepare: () => {
      events.push('recording-mode');
      return Promise.resolve();
    },
    start: () => {
      capturing = true;
      events.push('start');
      return Promise.resolve();
    },
    stop: () => {
      capturing = false;
      events.push('stop');
    },
    restore: () => {
      events.push('playback-mode');
      return Promise.resolve();
    },
  };
  const check = new MicrophoneCheck(port, () => undefined);
  return { check, port, events, capturing: () => capturing };
}

async function settle() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

void test('signed PCM levels and duration use the actual native format', () => {
  const frame = measureMicrophoneFrame({
    data: pcm([-16384, 16384]),
    channels: 1,
    sampleRate: 8000,
  });
  assert.deepEqual(frame, { level: 0.5, peak: 0.5, seconds: 0.00025 });
  const stereo = measureMicrophoneFrame({
    data: pcm([-32768, 32767, 0, 0]),
    channels: 2,
    sampleRate: 48000,
  });
  assert.ok(stereo);
  assert.equal(stereo.peak, 1);
  assert.equal(stereo.seconds, 2 / 48000);
  assert.ok(stereo.level > 0.7 && stereo.level < 0.71);
});

void test('empty and silent frames do not invent input levels', () => {
  assert.equal(measureMicrophoneFrame({ data: pcm([]), channels: 1, sampleRate: 16000 }), null);
  assert.deepEqual(measureMicrophoneFrame({ data: pcm([0, 0]), channels: 1, sampleRate: 16000 }), {
    level: 0,
    peak: 0,
    seconds: 0.000125,
  });
});

void test('malformed or unbounded PCM cannot become a valid device result', () => {
  for (const frame of [
    { data: new ArrayBuffer(3), channels: 1, sampleRate: 16000 },
    { data: pcm([1]), channels: 2, sampleRate: 16000 },
    { data: pcm([1]), channels: 3, sampleRate: 16000 },
    { data: pcm([1]), channels: 1, sampleRate: 7999 },
    { data: pcm([1]), channels: 1, sampleRate: Number.NaN },
    { data: new ArrayBuffer(32002), channels: 1, sampleRate: 16000 },
  ])
    assert.throws(() => measureMicrophoneFrame(frame));
});

void test('denied microphone permission never configures or starts capture', async () => {
  const { check, port, events } = device();
  port.permission = () => Promise.resolve(false);
  await check.start();
  assert.equal(check.state.status, 'denied');
  assert.deepEqual(events, []);
});

void test('double start does not create two native captures', async () => {
  const { check, events } = device();
  await Promise.all([check.start(), check.start()]);
  assert.equal(events.filter((event) => event === 'start').length, 1);
  await check.cancel();
});

void test('cancelled permission cannot later start the microphone', async () => {
  const { check, port, events } = device();
  const permission = deferred<boolean>();
  port.permission = () => permission.promise;
  const start = check.start();
  await check.cancel();
  permission.resolve(true);
  await start;
  assert.equal(check.state.status, 'cancelled');
  assert.ok(!events.includes('recording-mode'));
  assert.ok(!events.includes('start'));
});

void test('background cancellation records its cause and requires an explicit fresh start', async () => {
  const { check, capturing } = device();
  await check.start();
  await check.cancel('background');
  assert.equal(check.state.status, 'cancelled');
  assert.equal(check.state.cancelledBy, 'background');
  assert.equal(capturing(), false);
  await settle();
  assert.equal(capturing(), false);
  await check.start();
  assert.equal(check.state.cancelledBy, null);
  assert.equal(check.state.status, 'listening');
  await check.stop();
});

void test('permission errors leave capture off and allow a later retry', async () => {
  const { check, port, capturing } = device();
  port.permission = () => Promise.reject(new Error('Permission request failed'));
  await check.start();
  assert.equal(check.state.status, 'failed');
  assert.equal(capturing(), false);
  port.permission = () => Promise.resolve(true);
  await check.start();
  assert.equal(check.state.status, 'listening');
  await check.stop();
});

void test('cancelling pending audio setup prevents a later native start', async () => {
  const { check, port, events } = device();
  const prepared = deferred<undefined>();
  port.prepare = () => prepared.promise;
  const start = check.start();
  await settle();
  const cancelled = check.cancel();
  prepared.resolve(undefined);
  await Promise.all([start, cancelled]);
  assert.equal(check.state.status, 'cancelled');
  assert.ok(!events.includes('start'));
  assert.equal(events.at(-1), 'playback-mode');
});

void test('late native start is stopped before playback mode is restored', async () => {
  const { check, port, events, capturing } = device();
  const starting = deferred<undefined>();
  const originalStart = port.start;
  port.start = async () => {
    await starting.promise;
    await originalStart();
  };
  const start = check.start();
  await settle();
  const stopped = check.cancel();
  assert.equal(check.state.status, 'stopping');
  starting.resolve(undefined);
  await Promise.all([start, stopped]);
  assert.equal(check.state.status, 'cancelled');
  assert.equal(capturing(), false);
  assert.equal(events.at(-1), 'playback-mode');
  assert.ok(events.lastIndexOf('stop') > events.indexOf('start'));
});

void test('capture automatically stops even when no buffers arrive', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { check, capturing } = device();
  await check.start();
  context.mock.timers.tick(6000);
  await settle();
  assert.equal(check.state.status, 'complete');
  assert.equal(check.state.received, false);
  assert.equal(check.state.seconds, 0);
  assert.equal(capturing(), false);
});

void test('setup timeout invalidates a late native start', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { check, port, capturing } = device();
  const starting = deferred<undefined>();
  const originalStart = port.start;
  port.start = async () => {
    await starting.promise;
    await originalStart();
  };
  const start = check.start();
  await settle();
  context.mock.timers.tick(8000);
  assert.equal(check.state.status, 'stopping');
  starting.resolve(undefined);
  await start;
  await settle();
  assert.equal(check.state.status, 'failed');
  assert.equal(capturing(), false);
});

void test('frames received after stop cannot alter a result', async () => {
  const { check } = device();
  await check.start();
  check.receive({ data: pcm([16384, -16384]), channels: 1, sampleRate: 16000 });
  await check.stop();
  const result = check.state;
  check.receive({ data: pcm([-32768]), channels: 1, sampleRate: 16000 });
  assert.strictEqual(check.state, result);
  assert.equal(result.received, true);
  assert.equal(result.peak, 0.5);
});

void test('received zero-level audio remains distinct from receiving no buffers', async () => {
  const { check } = device();
  await check.start();
  check.receive({ data: pcm([0, 0]), channels: 1, sampleRate: 48000 });
  await check.stop();
  assert.equal(check.state.received, true);
  assert.equal(check.state.peak, 0);
  assert.equal(check.state.sampleRate, 48000);
  assert.equal(check.state.seconds, 2 / 48000);
});

void test('invalid frames or a format change stop capture without claiming success', async () => {
  for (const frame of [
    { data: pcm([1]), channels: 1, sampleRate: 8000 },
    { data: new ArrayBuffer(3), channels: 1, sampleRate: 16000 },
  ]) {
    const { check, capturing } = device();
    await check.start();
    check.receive({ data: pcm([1]), channels: 1, sampleRate: 16000 });
    check.receive(frame);
    await settle();
    assert.equal(check.state.status, 'failed');
    assert.equal(capturing(), false);
  }
});

void test('a device failure restores playback and a later test can run', async () => {
  const { check, port, events } = device();
  const originalStart = port.start;
  port.start = () => Promise.reject(new Error('Native input unavailable'));
  await check.start();
  assert.equal(check.state.status, 'failed');
  assert.equal(events.at(-1), 'playback-mode');
  port.start = originalStart;
  await check.start();
  assert.equal(check.state.status, 'listening');
  await check.stop();
});

void test('a native interruption fails active capture but own stop does not', async () => {
  const { check } = device();
  await check.start();
  check.interrupted();
  await settle();
  assert.equal(check.state.status, 'failed');
  await check.start();
  const stop = check.stop();
  check.interrupted();
  await stop;
  assert.equal(check.state.status, 'complete');
});

void test('playback mode is restored even when native stop throws', async () => {
  const { check, port, events } = device();
  await check.start();
  port.stop = () => {
    throw new Error('Native stop failed');
  };
  await check.stop();
  assert.equal(check.state.status, 'failed');
  assert.equal(events.at(-1), 'playback-mode');
});
