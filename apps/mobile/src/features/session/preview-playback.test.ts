import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PreviewPlayback } from './preview-playback.ts';

void test('cancelled speech cannot acknowledge or start after delayed device setup', async () => {
  const stopped = Promise.withResolvers<undefined>();
  let spoken = false;
  const playback = new PreviewPlayback({
    stop: () => stopped.promise,
    speak: () => {
      spoken = true;
    },
  });
  playback.play('Old reply', 'en-US', {
    started: () => assert.fail('Cancelled reply started'),
    finished: () => assert.fail('Cancelled reply was acknowledged'),
    failed: () => assert.fail('Cancelled reply changed the new screen'),
  });
  playback.stop();
  stopped.resolve(undefined);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(spoken, false);
});

void test('only speech that started can finish, repeated and stale completions are ignored', async () => {
  const events: string[] = [];
  let finish: () => void = () => undefined;
  let start: () => void = () => undefined;
  const playback = new PreviewPlayback({
    stop: () => Promise.resolve(),
    speak: (_text, _language, callbacks) => {
      start = callbacks.started;
      finish = callbacks.finished;
    },
  });
  const callbacks = {
    started: () => events.push('started'),
    finished: () => events.push('acknowledged'),
    failed: () => events.push('failed'),
  };
  playback.play('Missing audible start', 'en-US', callbacks);
  await new Promise<void>((resolve) => setImmediate(resolve));
  finish();
  finish();
  assert.deepEqual(events, ['failed']);

  playback.play('Audible reply', 'en-US', callbacks);
  await new Promise<void>((resolve) => setImmediate(resolve));
  start();
  start();
  finish();
  finish();
  assert.deepEqual(events, ['failed', 'started', 'acknowledged']);

  playback.play('Interrupted reply', 'en-US', callbacks);
  await new Promise<void>((resolve) => setImmediate(resolve));
  start();
  playback.stop();
  finish();
  assert.deepEqual(events, ['failed', 'started', 'acknowledged', 'started']);
});

void test('a device failure leaves the reply unread and does not block a later example', async () => {
  let stopFails = true;
  let failures = 0;
  let acknowledgements = 0;
  const playback = new PreviewPlayback({
    stop: () =>
      stopFails ? Promise.reject(new Error('Speech engine unavailable')) : Promise.resolve(),
    speak: (_text, _language, callbacks) => {
      callbacks.started();
      callbacks.finished();
    },
  });
  const callbacks = {
    started: () => undefined,
    finished: () => {
      acknowledgements += 1;
    },
    failed: () => {
      failures += 1;
    },
  };
  playback.play('Unavailable engine', 'id-ID', callbacks);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(failures, 1);
  assert.equal(acknowledgements, 0);

  stopFails = false;
  playback.play('Another example', 'id-ID', callbacks);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(acknowledgements, 1);
});

void test('cancelled queued previews cannot stop another screen’s device speech later', async () => {
  const delayedSetup = Promise.withResolvers<undefined>();
  let stops = 0;
  let otherScreenSpeaking = false;
  const playback = new PreviewPlayback({
    stop: () => {
      assert.equal(otherScreenSpeaking, false, 'Stale preview stopped the new screen');
      stops += 1;
      return stops === 1 ? delayedSetup.promise : Promise.resolve();
    },
    speak: () => assert.fail('Cancelled preview spoke on the new screen'),
  });
  const callbacks = {
    started: () => assert.fail('Cancelled preview started'),
    finished: () => assert.fail('Cancelled preview was acknowledged'),
    failed: () => assert.fail('Cancelled preview changed the new screen'),
  };
  playback.play('Pending setup', 'en-US', callbacks);
  await new Promise<void>((resolve) => setImmediate(resolve));
  playback.play('Queued example', 'en-US', callbacks);
  playback.stop();
  otherScreenSpeaking = true;
  delayedSetup.resolve(undefined);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(stops, 2);
});
