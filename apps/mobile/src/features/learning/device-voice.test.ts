import assert from 'node:assert/strict';
import { test } from 'node:test';

import { selectDeviceVoice } from './device-voice.ts';

function voice(language: string, quality = 'Default') {
  return { identifier: language, language, quality };
}

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
