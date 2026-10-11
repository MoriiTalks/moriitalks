// Verifies UI identity and cancellation gates without native audio or model calls.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HarnessEvent } from '@contracts/harness';

import { HarnessCursor } from './harness-runtime.ts';
import { voiceEndpoints } from './voice-runtime.ts';

function ready(sessionId = 'session-a'): HarnessEvent {
  return {
    version: 2,
    type: 'session.ready',
    sequence: 1,
    sessionId,
    generation: 0,
    kind: 'preview',
    limits: { maxSessionSeconds: 300, maxTurnSeconds: 30, maxTurns: 8 },
  };
}

function response(
  sequence: number,
  turnId: number,
  generation: number,
  responseId = 'reply-a',
  sessionId = 'session-a',
): HarnessEvent {
  return {
    version: 2,
    type: 'turn.response',
    sequence,
    sessionId,
    generation,
    turnId,
    responseId,
    text: 'Try adding one reason.',
    source: 'script',
    animation: 'encourage',
    panel: null,
  };
}

void test('harness endpoint uses v2 while the existing voice endpoint stays v1', () => {
  assert.equal(voiceEndpoints(undefined, 'android', 2).socket, 'ws://10.0.2.2:8080/v2/voice');
  assert.equal(
    voiceEndpoints('https://voice.example.com', 'ios', 2).config,
    'https://voice.example.com/v2/voice/config',
  );
  assert.equal(voiceEndpoints(undefined, 'web').socket, 'ws://127.0.0.1:8080/v1/voice');
});

void test('the initial ready event binds a session and cannot be replayed', () => {
  const cursor = new HarnessCursor();
  assert.equal(cursor.accept(response(1, 1, 1)), false);
  assert.equal(cursor.accept(ready()), true);
  assert.equal(cursor.accept(ready()), false);
  cursor.begin();
  assert.equal(cursor.accept(response(2, 1, 1, 'reply-a', 'session-b')), false);
  assert.equal(cursor.accept(response(2, 1, 1)), true);
});

void test('a cancelled reply cannot restore a panel or become a playback target', () => {
  const cursor = new HarnessCursor();
  cursor.accept(ready());
  cursor.begin();
  cursor.cancel();
  assert.equal(cursor.accept(response(2, 1, 1)), false);
  assert.equal(cursor.reply(), null);
  assert.equal(cursor.begin(), 2);
  assert.equal(cursor.accept(response(3, 2, 1)), false);
  assert.equal(cursor.accept(response(4, 2, 2, 'reply-b')), true);
  assert.equal(cursor.reply(), 'reply-b');
});

void test('audio must name the exact accepted response, in event order', () => {
  const cursor = new HarnessCursor();
  cursor.accept(ready());
  cursor.begin();
  cursor.accept(response(2, 1, 1));
  const audio: HarnessEvent = {
    version: 2,
    type: 'audio.start',
    sequence: 3,
    sessionId: 'session-a',
    generation: 1,
    turnId: 1,
    responseId: 'reply-b',
    format: 'mp3',
  };
  assert.equal(cursor.accept(audio), false);
  assert.equal(cursor.accept({ ...audio, responseId: 'reply-a' }), false);
  assert.equal(cursor.accept({ ...audio, sequence: 4, responseId: 'reply-a' }), true);
  assert.equal(cursor.accept(response(5, 1, 1, 'replacement')), false);
  assert.equal(cursor.reply(), 'reply-a');
});

void test('permission cancellation does not consume an unannounced wire generation', () => {
  const cursor = new HarnessCursor();
  cursor.accept(ready());
  cursor.begin();
  cursor.cancel(true);
  assert.equal(cursor.begin(), 1);
  assert.equal(cursor.generation(), 1);
});
