import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { z } from 'zod';

import {
  parseVoiceConfig,
  parseVoiceEvent,
  voiceCommandSchema,
  voiceEventSchema,
  voiceJsonSchema,
} from './voice.ts';

// Fixtures exercise the wire boundary shared by the mobile client and Go voice lab.
void test('the HTTP config and every event fixture match the shared contract', () => {
  const config: unknown = JSON.parse(
    readFileSync(new URL('./voice.config.example.json', import.meta.url), 'utf8'),
  );
  assert.ok(parseVoiceConfig(config));
  const examples: unknown = JSON.parse(
    readFileSync(new URL('./voice.events.example.json', import.meta.url), 'utf8'),
  );
  const events = z.array(voiceEventSchema).parse(examples);
  assert.equal(events.length, 11);
  for (const [index, event] of events.entries()) {
    assert.equal(event.sequence, index + 1);
    assert.deepEqual(parseVoiceEvent(event), event);
  }
});

void test('the JSON Schema is generated from the runtime contract', () => {
  const generated: unknown = JSON.parse(
    readFileSync(new URL('./voice.schema.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(generated, voiceJsonSchema());
});

void test('reject incompatible versions, unbounded payloads, and unknown fields', () => {
  assert.equal(
    parseVoiceConfig({
      version: 2,
      liveEnabled: false,
      maxSessionSeconds: 300,
      maxTurnSeconds: 30,
      maxTurns: 8,
    }),
    null,
  );
  const base = {
    version: 1,
    sequence: 1,
    turnId: 1,
    type: 'turn.response',
    source: 'ai',
    text: 'A short answer.',
  };
  for (const event of [
    null,
    {},
    { ...base, version: 2 },
    { ...base, sequence: 0 },
    { ...base, turnId: 9 },
    { ...base, text: 'x'.repeat(501) },
    { ...base, html: '<script />' },
  ]) {
    assert.equal(parseVoiceEvent(event), null);
  }
  assert.equal(
    parseVoiceEvent({ version: 1, sequence: 1, type: 'audio.end', turnId: 1, bytes: 524289 }),
    null,
  );
  assert.equal(
    parseVoiceEvent({ version: 1, sequence: 1, type: 'turn.metrics', turnId: 1, sttMs: Infinity }),
    null,
  );
});

void test('accept bounded PCM commands and reject malformed or coerced values', () => {
  const start = {
    type: 'turn.start',
    turnId: 1,
    sampleRate: 16000,
    channels: 1,
    encoding: 'pcm_s16le',
  };
  assert.ok(voiceCommandSchema.safeParse(start).success);
  assert.ok(
    voiceCommandSchema.safeParse({
      type: 'session.start',
      version: 1,
      locale: 'id',
      mode: 'talk',
      topic: 'hobby',
      adultConfirmed: false,
    }).success,
  );
  for (const command of [
    { ...start, sampleRate: 96000 },
    { ...start, channels: 2 },
    { ...start, turnId: '1' },
    { ...start, encoding: 'float32' },
    { type: 'session.close', secret: 'unexpected' },
  ]) {
    assert.equal(voiceCommandSchema.safeParse(command).success, false);
  }
});
