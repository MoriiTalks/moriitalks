// Checks transport, turn ordering, and audio limits without Expo or provider calls.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AudioQueue,
  AudioReply,
  AudioUpload,
  VoiceCursor,
  captureDurationMs,
  monoPCM,
  voiceEndpoints,
} from './voice-runtime.ts';

void test('remote voice transport requires HTTPS and rejects embedded credentials', () => {
  assert.throws(() => voiceEndpoints('http://voice.example.com', 'android'));
  assert.throws(() => voiceEndpoints('https://token@voice.example.com', 'ios'));
  assert.throws(() => voiceEndpoints('https://voice.example.com?token=secret', 'ios'));
  assert.equal(
    voiceEndpoints('https://voice.example.com', 'ios').socket,
    'wss://voice.example.com/v1/voice',
  );
  assert.equal(voiceEndpoints(undefined, 'android').config, 'http://10.0.2.2:8080/v1/voice/config');
});

void test('cancelled and out-of-order turns cannot restart audio', () => {
  const cursor = new VoiceCursor();
  const first = cursor.begin();
  assert.equal(cursor.accept(1, first), true);
  cursor.cancel();
  assert.equal(cursor.accept(2, first), false);
  const second = cursor.begin();
  assert.equal(cursor.accept(3, first), false);
  assert.equal(cursor.accept(2, second), false);
  assert.equal(cursor.accept(4, second), true);
});

void test('cancelled permission setup does not consume an unstarted turn', () => {
  const cursor = new VoiceCursor();
  assert.equal(cursor.begin(), 1);
  cursor.cancel(true);
  assert.equal(cursor.begin(), 1);
  cursor.cancel();
  assert.equal(cursor.begin(), 2);
});

void test('response audio is bounded and incomplete payloads cannot play', () => {
  const reply = new AudioReply();
  reply.append(new Uint8Array([1, 2]).buffer);
  assert.throws(() => reply.finish(3));
  assert.throws(() => {
    reply.append(new ArrayBuffer(512 * 1024));
  });
  assert.deepEqual(reply.finish(2), new Uint8Array([1, 2]));
  assert.throws(() => reply.finish(0));
});

void test('slow uploads stop at two seconds and only valid acknowledgements release space', () => {
  const upload = new AudioUpload();
  upload.reserve(32000, 16000);
  upload.reserve(32000, 16000);
  assert.throws(() => {
    upload.reserve(2, 16000);
  });
  assert.throws(() => {
    upload.acknowledge(64002);
  });
  upload.acknowledge(32000);
  upload.reserve(32000, 16000);
  assert.throws(() => {
    upload.acknowledge(31998);
  });
});

void test('stereo capture is downmixed with signed little-endian samples', () => {
  const stereo = new ArrayBuffer(8);
  const data = new DataView(stereo);
  data.setInt16(0, 2000, true);
  data.setInt16(2, -1000, true);
  data.setInt16(4, -32768, true);
  data.setInt16(6, 32767, true);
  const mono = new DataView(monoPCM(stereo, 2));
  assert.equal(mono.getInt16(0, true), 500);
  assert.equal(mono.getInt16(2, true), 0);
  assert.throws(() => monoPCM(new ArrayBuffer(3), 1));
  assert.throws(() => monoPCM(stereo, 3));
});

void test('cancelled native setup settles before a newer capture can start', async () => {
  const queue = new AudioQueue();
  // Hold old setup open to verify its cleanup finishes before the next capture starts.
  const setup = Promise.withResolvers<undefined>();
  const events: string[] = [];
  let active = true;
  const first = queue.run(
    () => active,
    async () => {
      events.push('starting old capture');
      await setup.promise;
      if (!active) events.push('stopping old capture');
    },
  );
  await Promise.resolve();
  active = false;
  const second = queue.run(
    () => true,
    () => {
      events.push('starting new capture');
      return Promise.resolve();
    },
  );
  assert.deepEqual(events, ['starting old capture']);
  setup.resolve(undefined);
  await Promise.all([first, second]);
  assert.deepEqual(events, [
    'starting old capture',
    'stopping old capture',
    'starting new capture',
  ]);
});

void test('stale queued playback never changes a newer recording mode', async () => {
  const queue = new AudioQueue();
  const pending = Promise.withResolvers<undefined>();
  let active = true;
  const events: string[] = [];
  const setup = queue.run(
    () => true,
    () => pending.promise,
  );
  const playback = queue.run(
    () => active,
    () => {
      events.push('disable recording');
      return Promise.resolve();
    },
  );
  active = false;
  const capture = queue.run(
    () => true,
    () => {
      events.push('enable recording');
      return Promise.resolve();
    },
  );
  pending.resolve(undefined);
  await Promise.all([setup, playback, capture]);
  assert.deepEqual(events, ['enable recording']);
});

void test('failed native transitions do not block later sessions', async () => {
  const queue = new AudioQueue();
  await assert.rejects(
    queue.run(
      () => true,
      () => Promise.reject(new Error('device unavailable')),
    ),
  );
  let completed = false;
  await queue.run(
    () => true,
    () => {
      completed = true;
      return Promise.resolve();
    },
  );
  assert.equal(completed, true);
});

void test('capture commits before the server hard limit', () => {
  assert.equal(captureDurationMs(30), 29000);
  assert.equal(captureDurationMs(1), 100);
  assert.ok(captureDurationMs(5) < 5000);
});
