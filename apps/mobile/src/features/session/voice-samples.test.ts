import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getVoiceSamples } from './voice-samples.ts';

void test('both languages cover the same five distinct delivery tasks', () => {
  const id = getVoiceSamples('id');
  const en = getVoiceSamples('en');
  assert.equal(id.length, 5);
  assert.equal(new Set(id.map((sample) => sample.id)).size, 5);
  assert.deepEqual(
    id.map((sample) => sample.id),
    en.map((sample) => sample.id),
  );
  assert.equal(new Set([...id, ...en].map((sample) => sample.text)).size, 10);
});

void test('audition text fits the existing synthesis budget and contains no markup', () => {
  for (const locale of ['id', 'en'] satisfies readonly ('id' | 'en')[]) {
    for (const sample of getVoiceSamples(locale)) {
      assert.ok(sample.text.length <= 400);
      assert.ok(sample.text.trim().split(/\s+/).length <= 45);
      assert.ok(sample.title.trim() && sample.focus.trim());
      assert.ok(!/[<>]/.test(sample.text));
      assert.ok(/[.?]$/.test(sample.text));
    }
  }
});

void test('question and pause samples preserve the punctuation the voice must interpret', () => {
  for (const locale of ['id', 'en'] satisfies readonly ('id' | 'en')[]) {
    const samples = getVoiceSamples(locale);
    assert.ok(samples.find((sample) => sample.id === 'question')?.text.endsWith('?'));
    assert.equal(samples.find((sample) => sample.id === 'pause')?.text.split('. ').length, 2);
  }
});
