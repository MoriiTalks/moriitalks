import assert from 'node:assert/strict';
import { test } from 'node:test';

import { browserSpeechEnvironment, createBrowserSpeech } from './browser-speech.ts';
import type { BrowserRecognition } from './browser-speech.ts';
import type { RecognitionCallbacks } from './device-talk-session.ts';

class FakeRecognition implements BrowserRecognition {
  lang = '';
  continuous = true;
  interimResults = false;
  maxAlternatives = 0;
  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onnomatch: (() => void) | null = null;
  onend: (() => void) | null = null;
  starts = 0;
  stops = 0;
  aborts = 0;
  startFails = false;
  abortFails = false;

  start() {
    this.starts += 1;
    if (this.startFails) throw new Error('Recognition start failed');
  }
  stop() {
    this.stops += 1;
  }
  abort() {
    this.aborts += 1;
    if (this.abortFails) throw new Error('Recognition abort failed');
  }
}

function fixture() {
  const instances: FakeRecognition[] = [];
  const events: unknown[] = [];
  const callbacks: RecognitionCallbacks = {
    started: () => events.push('started'),
    result: (text, final) => events.push({ text, final }),
    ended: () => events.push('ended'),
    failed: (reason) => events.push(reason),
  };
  const driver = createBrowserSpeech(() => ({
    secureContext: true,
    create: () => {
      const instance = new FakeRecognition();
      instances.push(instance);
      return instance;
    },
  }));
  function latest() {
    const instance = instances.at(-1);
    assert.ok(instance);
    return instance;
  }
  return { driver, instances, events, callbacks, latest };
}

function result(text: string, final: boolean) {
  return { results: [{ isFinal: final, 0: { transcript: text } }] };
}

void test('SSR, missing APIs, and insecure origins stay unavailable without requesting a microphone', async () => {
  assert.equal(browserSpeechEnvironment(undefined), null);
  assert.equal(browserSpeechEnvironment({ isSecureContext: true }), null);
  let scope: unknown = null;
  const driver = createBrowserSpeech(() => browserSpeechEnvironment(scope));
  assert.equal(driver.supported, false);
  assert.equal(await driver.permission(), false);
  scope = { isSecureContext: false, SpeechRecognition: FakeRecognition };
  assert.equal(driver.supported, false);
  assert.equal(await driver.permission(), false);
  assert.throws(() => driver.recognize('id', fixture().callbacks));
  scope = { isSecureContext: true, SpeechRecognition: FakeRecognition };
  assert.equal(driver.supported, true);
  assert.equal(await driver.permission(), true);
});

void test('standard and prefixed browser constructors are discovered without unsafe casts', () => {
  for (const key of ['SpeechRecognition', 'webkitSpeechRecognition']) {
    const environment = browserSpeechEnvironment({ isSecureContext: true, [key]: FakeRecognition });
    assert.ok(environment?.create() instanceof FakeRecognition);
  }
  const environment = browserSpeechEnvironment({ isSecureContext: true, SpeechRecognition: Date });
  assert.throws(() => environment?.create());
});

void test('permission checks do not construct or start capture, one explicit capture configures the locale', async () => {
  const f = fixture();
  assert.equal(await f.driver.permission(), true);
  assert.equal(f.instances.length, 0);
  f.driver.recognize('id', f.callbacks);
  const instance = f.latest();
  assert.equal(instance.lang, 'id-ID');
  assert.equal(instance.continuous, false);
  assert.equal(instance.interimResults, true);
  assert.equal(instance.maxAlternatives, 1);
  assert.equal(instance.starts, 1);
  assert.equal(await f.driver.permission(), false);
  assert.throws(() => f.driver.recognize('en', f.callbacks));
  instance.onstart?.();
  instance.onstart?.();
  instance.onend?.();
  assert.deepEqual(f.events, ['started', 'ended']);
  f.driver.recognize('en', f.callbacks);
  assert.equal(f.latest().lang, 'en-US');
  f.latest().onend?.();
});

void test('interim results update, a final utterance is emitted once and only end releases capture', async () => {
  const f = fixture();
  const capture = f.driver.recognize('id', f.callbacks);
  const instance = f.latest();
  instance.onresult?.(result(' Saya suka ', false));
  instance.onresult?.({
    results: [
      { isFinal: true, 0: { transcript: 'Saya suka' } },
      { isFinal: true, 0: { transcript: 'membaca.' } },
    ],
  });
  instance.onresult?.(result('Duplicate final', true));
  capture.stop();
  capture.stop();
  assert.equal(instance.stops, 1);
  assert.equal(await f.driver.permission(), false);
  instance.onend?.();
  assert.deepEqual(f.events, [
    { text: 'Saya suka', final: false },
    { text: 'Saya suka membaca.', final: true },
    'ended',
  ]);
  assert.equal(await f.driver.permission(), true);
  assert.equal(instance.onresult, null);
  assert.equal(instance.onend, null);
});

void test('manual stop still accepts the final result generated while draining', () => {
  const f = fixture();
  const capture = f.driver.recognize('en', f.callbacks);
  const instance = f.latest();
  capture.stop();
  instance.onresult?.(result('Finished speaking', true));
  instance.onend?.();
  assert.deepEqual(f.events, [{ text: 'Finished speaking', final: true }, 'ended']);
});

for (const [error, reason] of [
  ['not-allowed', 'permission'],
  ['service-not-allowed', 'permission'],
  ['network', 'unavailable'],
  ['audio-capture', 'unavailable'],
  ['language-not-supported', 'unavailable'],
  ['aborted', 'unavailable'],
  ['no-speech', 'empty'],
]) {
  void test(`browser ${String(error)} fails once as ${String(reason)} without restarting`, () => {
    const f = fixture();
    f.driver.recognize('id', f.callbacks);
    const instance = f.latest();
    instance.onerror?.({ error });
    instance.onerror?.({ error });
    instance.onresult?.(result('Late result', true));
    instance.onend?.();
    assert.deepEqual(f.events, [reason]);
    assert.equal(f.instances.length, 1);
  });
}

void test('no-match and malformed browser results fail without inventing a transcript', () => {
  for (const malformed of [null, {}, { results: [] }, { results: [{ isFinal: true }] }]) {
    const f = fixture();
    f.driver.recognize('en', f.callbacks);
    f.latest().onresult?.(malformed);
    f.latest().onend?.();
    assert.deepEqual(f.events, ['unavailable']);
  }
  const f = fixture();
  f.driver.recognize('en', f.callbacks);
  f.latest().onnomatch?.();
  f.latest().onend?.();
  assert.deepEqual(f.events, ['empty']);
});

void test('abort detaches input immediately, stale callbacks cannot affect a resumed recognizer', async () => {
  const f = fixture();
  const capture = f.driver.recognize('id', f.callbacks);
  const old = f.latest();
  const staleStart = old.onstart;
  const staleResult = old.onresult;
  const staleError = old.onerror;
  const oldEnd = old.onend;
  const drained = capture.abort();
  assert.equal(capture.abort(), drained);
  assert.equal(old.aborts, 1);
  assert.equal(old.onstart, null);
  assert.equal(old.onresult, null);
  assert.equal(old.onerror, null);
  assert.equal(old.onnomatch, null);
  assert.equal(await f.driver.permission(), false);
  staleStart?.();
  staleResult?.(result('Cancelled words', true));
  staleError?.({ error: 'network' });
  oldEnd?.();
  await drained;
  assert.equal(await f.driver.permission(), true);
  f.driver.recognize('en', f.callbacks);
  oldEnd?.();
  staleResult?.(result('Stale words', true));
  f.latest().onresult?.(result('Current words', true));
  f.latest().onend?.();
  assert.deepEqual(f.events, [{ text: 'Current words', final: true }, 'ended']);
});

void test('a missing end bounds abort at two seconds and blocks new capture until actual end', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  const capture = f.driver.recognize('id', f.callbacks);
  const instance = f.latest();
  instance.abortFails = true;
  let complete = false;
  const drained = capture.abort().then(() => {
    complete = true;
  });
  context.mock.timers.tick(1999);
  await Promise.resolve();
  assert.equal(complete, false);
  context.mock.timers.tick(1);
  await drained;
  assert.equal(await f.driver.permission(), false);
  assert.throws(() => f.driver.recognize('en', f.callbacks));
  instance.onend?.();
  assert.equal(await f.driver.permission(), true);
  assert.deepEqual(f.events, []);
});

void test('a synchronous start failure detaches handlers and releases the capture lock', async () => {
  const instance = new FakeRecognition();
  instance.startFails = true;
  const driver = createBrowserSpeech(() => ({ secureContext: true, create: () => instance }));
  assert.throws(() => driver.recognize('id', fixture().callbacks));
  assert.equal(instance.onstart, null);
  assert.equal(instance.onresult, null);
  assert.equal(instance.onend, null);
  assert.equal(await driver.permission(), true);
});
