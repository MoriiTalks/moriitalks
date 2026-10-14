import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadDeviceVoices, selectDeviceVoice } from './device-voice.ts';

function voice(language: string, quality = 'Default') {
  return { identifier: language, language, quality };
}

void test('voice discovery waits for a delayed engine instead of treating loading as unavailable', async () => {
  const engine = Promise.withResolvers<ReturnType<typeof voice>[]>();
  let completed = false;
  const inventory = loadDeviceVoices(() => engine.promise).then((voices) => {
    completed = true;
    return voices;
  });
  await Promise.resolve();
  assert.equal(completed, false);
  const candidate = voice('id-ID');
  engine.resolve([candidate]);
  assert.deepEqual(await inventory, [candidate]);
});

void test('a stalled voice engine times out and cannot replace the next inventory', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const engine = Promise.withResolvers<ReturnType<typeof voice>[]>();
  const inventory = loadDeviceVoices(() => engine.promise);
  context.mock.timers.tick(4000);
  assert.deepEqual(await inventory, []);
  const candidate = voice('id-ID');
  assert.deepEqual(await loadDeviceVoices(() => Promise.resolve([candidate])), [candidate]);
  engine.resolve([voice('en-US')]);
  assert.deepEqual(await inventory, []);
});

void test('voice discovery failure leaves a usable empty inventory', async () => {
  assert.deepEqual(
    await loadDeviceVoices(() => Promise.reject(new Error('Voice engine unavailable'))),
    [],
  );
});

void test('Indonesian voice selection accepts current and legacy Android language codes', () => {
  for (const language of ['id', 'id-ID', 'ID_id', 'in', 'in-ID', 'IN_id']) {
    const candidate = voice(language);
    assert.equal(selectDeviceVoice([candidate], 'id'), candidate);
  }
});

void test('voice selection matches the primary language without accepting similar prefixes', () => {
  const english = voice('en-GB');
  const indonesian = voice('in-ID');
  const voices = [voice('ind'), voice('ina'), voice('eng'), voice('hi-IN'), english, indonesian];
  assert.equal(selectDeviceVoice(voices, 'id'), indonesian);
  assert.equal(selectDeviceVoice(voices, 'en'), english);
});

void test('enhanced voices are preferred only within the requested language', () => {
  const preferred = voice('in-ID', 'Enhanced');
  const voices = [voice('en-US', 'Enhanced'), voice('id-ID'), preferred];
  assert.equal(selectDeviceVoice(voices, 'id'), preferred);
  assert.deepEqual(
    voices.map((item) => item.identifier),
    ['en-US', 'id-ID', 'in-ID'],
  );
});

void test('unavailable languages do not silently fall back to another language', () => {
  assert.equal(selectDeviceVoice([], 'id'), undefined);
  assert.equal(selectDeviceVoice([voice('en-US')], 'id'), undefined);
  assert.equal(selectDeviceVoice([voice('id-ID')], 'en'), undefined);
});
