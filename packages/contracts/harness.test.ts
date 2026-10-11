import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { z } from 'zod';

import {
  type HarnessCommand,
  type HarnessEvent,
  type HarnessPanel,
  harnessCommandSchema,
  harnessJsonSchema,
  harnessPanelSchema,
  harnessReplyJsonSchema,
  harnessReplySchema,
  parseHarnessConfig,
  parseHarnessEvent,
} from './harness.ts';

const header = { version: 2, sequence: 1, sessionId: 'session-1', generation: 1 } satisfies Pick<
  HarnessEvent,
  'version' | 'sequence' | 'sessionId' | 'generation'
>;
const turn = { ...header, turnId: 1 };
const response = { ...turn, responseId: 'response-1' };
const limits = { maxSessionSeconds: 300, maxTurnSeconds: 30, maxTurns: 8 };

// These fixtures cover each allowlisted interface rather than arbitrary model instructions.
const panels: HarnessPanel[] = [
  { type: 'show_hint', title: 'One reason', text: 'Try adding why you enjoy it.' },
  {
    type: 'show_choices',
    title: 'Choose a topic',
    choices: [
      { id: 'hobby', label: 'My hobby' },
      { id: 'day', label: 'My day' },
    ],
  },
  { type: 'show_outline', title: 'Two parts', parts: ['Your idea', 'One reason'] },
  {
    type: 'propose_feedback',
    quote: 'I enjoy drawing',
    observation: 'You shared a clear idea.',
    nextStep: 'Add one reason.',
    rubricId: 'idea-and-reason-v1',
    status: 'needs_practice',
  },
  {
    type: 'propose_next_mission',
    missionId: 'first-explanation',
    title: 'Explain one idea',
    text: 'Practice an idea with one reason.',
  },
  { type: 'request_end_session', text: 'Would you like to finish for today?' },
];

void test('accept version 2 limits and each response, audio, and lifecycle event', () => {
  const config = { version: 2, liveEnabled: false, ...limits };
  assert.deepEqual(parseHarnessConfig(config), config);
  const events: HarnessEvent[] = [
    { ...header, generation: 0, type: 'session.ready', kind: 'preview', limits },
    { ...turn, type: 'transcript', text: 'I enjoy drawing.', final: true },
    { ...turn, type: 'turn.state', state: 'thinking' },
    {
      ...response,
      type: 'turn.response',
      text: 'Add one reason.',
      source: 'script',
      animation: 'encourage',
      panel: null,
    },
    { ...response, type: 'audio.start', format: 'mp3' },
    { ...response, type: 'audio.end', bytes: 16 },
    {
      ...response,
      type: 'turn.metrics',
      sttMs: 20,
      coachMs: 30,
      ttsMs: 40,
      totalMs: 90,
      audioSeconds: 1,
      inputTokens: 10,
      outputTokens: 10,
      ttsCharacters: 15,
    },
    { ...turn, type: 'turn.cancelled' },
    { ...turn, type: 'turn.audio.accepted', bytes: 32000 },
    { ...turn, type: 'error', code: 'unsafe', message: 'Choose another topic.', recoverable: true },
    { ...header, type: 'session.closed', reason: 'client' },
  ];
  for (const event of events) {
    assert.deepEqual(parseHarnessEvent(event), event);
  }
  for (const panel of panels) {
    const event = {
      ...response,
      type: 'turn.response',
      text: 'Try one reason.',
      source: 'ai',
      animation: 'neutral',
      panel,
    };
    assert.deepEqual(parseHarnessEvent(event), event);
  }
});

void test('accept bounded commands with explicit versions and response identities', () => {
  const command = { version: 2, turnId: 1, generation: 9 } satisfies Pick<
    Extract<HarnessCommand, { type: 'turn.commit' }>,
    'version' | 'turnId' | 'generation'
  >;
  const commands: HarnessCommand[] = [
    {
      version: 2,
      type: 'session.start',
      locale: 'id',
      mode: 'talk',
      topic: 'hobby',
      adultConfirmed: false,
    },
    { ...command, type: 'turn.start', sampleRate: 16000, channels: 1, encoding: 'pcm_s16le' },
    { ...command, type: 'turn.commit' },
    { ...command, type: 'turn.cancel' },
    { ...command, type: 'turn.text', text: 'I enjoy drawing.' },
    { ...command, type: 'turn.action', responseId: 'response-1', actionId: 'hobby' },
    { ...command, type: 'response.played', responseId: 'response-1' },
    { version: 2, type: 'panel.dismiss', generation: 9, responseId: 'response-1' },
    { version: 2, type: 'session.close' },
  ];
  for (const item of commands) {
    assert.deepEqual(harnessCommandSchema.parse(item), item);
  }
});

void test('reject unversioned commands, invalid identities, and arbitrary actions', () => {
  const command = {
    version: 2,
    type: 'turn.action',
    turnId: 1,
    generation: 1,
    responseId: 'response-1',
    actionId: 'hint',
  };
  for (const item of [
    { ...command, version: 1 },
    { type: 'session.close' },
    { ...command, turnId: 9 },
    { ...command, generation: 0 },
    { ...command, generation: 1.5 },
    { ...command, generation: Number.MAX_SAFE_INTEGER + 1 },
    { ...command, responseId: '' },
    { ...command, actionId: 'open_browser' },
    { ...command, url: 'https://example.com' },
    { version: 2, type: 'turn.text', turnId: 1, generation: 1, text: 'x'.repeat(1001) },
  ]) {
    assert.equal(harnessCommandSchema.safeParse(item).success, false);
  }
});

void test('reject stale contract shapes and unbounded response data at the client boundary', () => {
  const event = {
    ...response,
    type: 'turn.response',
    text: 'A short response.',
    source: 'ai',
    animation: 'neutral',
    panel: null,
  };
  for (const item of [
    null,
    { ...event, version: 1 },
    { ...event, sessionId: '' },
    { ...event, sequence: 0 },
    { ...event, generation: -1 },
    { ...event, responseId: undefined },
    { ...event, animation: 'record_microphone' },
    { ...event, text: 'x'.repeat(401) },
    { ...event, instructions: 'Run this code' },
    { ...response, type: 'audio.end', bytes: 524289 },
  ]) {
    assert.equal(parseHarnessEvent(item), null);
  }
  assert.equal(parseHarnessConfig({ version: 1, liveEnabled: false, ...limits }), null);
});

void test('reject unknown panel capabilities, duplicate choices, and excessive panel content', () => {
  for (const panel of [
    {
      type: 'show_choices',
      title: 'Pick one',
      choices: [
        { id: 'hobby', label: 'A' },
        { id: 'hobby', label: 'B' },
      ],
    },
    { type: 'show_choices', title: 'Pick one', choices: [] },
    { type: 'show_choices', title: 'Pick one', choices: [{ id: 'buy', label: 'Buy' }] },
    { type: 'show_outline', title: 'Try this', parts: ['One', 'Two', 'Three', 'Four'] },
    { type: 'show_hint', title: 'Try this', text: 'x'.repeat(201) },
    { type: 'show_hint', title: 'Try this', text: 'One reason', html: '<script />' },
    {
      type: 'propose_next_mission',
      missionId: 'unknown-mission',
      title: 'Try this',
      text: 'One reason',
    },
    { type: 'execute_code', text: 'Run this script' },
  ]) {
    assert.equal(harnessPanelSchema.safeParse(panel).success, false);
  }
  for (const panel of panels) {
    assert.deepEqual(harnessPanelSchema.parse(panel), panel);
    assert.ok(
      harnessReplySchema.safeParse({ text: 'One short reply.', animation: 'neutral', panel })
        .success,
    );
  }
  assert.equal(
    harnessReplySchema.safeParse({ text: 'One short reply.', animation: 'neutral' }).success,
    false,
  );
});

// Every provider object must reject extra keys and explicitly require its declared properties.
function assertStrictObjects(value: unknown): void {
  const array = z.array(z.unknown()).safeParse(value);
  if (array.success) {
    for (const item of array.data) assertStrictObjects(item);
    return;
  }
  const record = z.record(z.string(), z.unknown()).safeParse(value);
  if (!record.success) return;
  assert.equal(record.data['oneOf'], undefined);
  if (record.data['type'] === 'object') {
    assert.equal(record.data['additionalProperties'], false);
    const properties = z.record(z.string(), z.unknown()).parse(record.data['properties']);
    const required = z.array(z.string()).parse(record.data['required']);
    assert.deepEqual(
      [...required].sort((left, right) => left.localeCompare(right)),
      Object.keys(properties).sort((left, right) => left.localeCompare(right)),
    );
  }
  for (const item of Object.values(record.data)) assertStrictObjects(item);
}

void test('generate wire and embedded provider schemas from the canonical validators', () => {
  const generated: unknown = JSON.parse(
    readFileSync(new URL('./harness.schema.json', import.meta.url), 'utf8'),
  );
  const provider: unknown = JSON.parse(
    readFileSync(
      new URL('../../services/api/internal/voice/harness_reply.schema.json', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(generated, harnessJsonSchema());
  assert.deepEqual(provider, harnessReplyJsonSchema());
  assertStrictObjects(provider);
});
