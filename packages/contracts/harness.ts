import { z } from 'zod';

import { voiceLimitsSchema } from './voice.ts';

// Version 2 adds bounded interface proposals without changing the original voice contract.
export const harnessProtocolVersion = 2;

const locale = z.enum(['id', 'en']);
const mode = z.enum(['talk', 'practice']);
const topic = z.enum(['hobby', 'day', 'ideas']);
const kind = z.enum(['preview', 'live']);
const turnId = z.int().min(1).max(8);
const generation = z.int().nonnegative();
const responseId = z.string().min(1).max(128);
const title = z.string().min(1).max(60);
const text = z.string().min(1).max(200);
const metric = z.number().nonnegative();
const count = z.int().nonnegative();
const animation = z.enum(['neutral', 'wave', 'think', 'encourage']);
const actionId = z.enum([
  'hobby',
  'day',
  'ideas',
  'hint',
  'outline',
  'retry',
  'finish',
  'start_mission',
  'end_session',
]);

// A generation invalidates stale UI, responseId binds playback and actions to one reply.
const header = {
  version: z.literal(harnessProtocolVersion),
  sequence: z.int().positive(),
  sessionId: z.string().min(1).max(128),
  generation,
};
const turn = { ...header, turnId };
const response = { ...turn, responseId };
const command = { version: z.literal(harnessProtocolVersion) };
const turnCommand = { ...command, turnId, generation: generation.min(1) };

// Panels contain display data only, every possible interaction has a fixed action identifier.
export const harnessPanelSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('show_hint'), title, text }),
  z.strictObject({
    type: z.literal('show_choices'),
    title,
    choices: z
      .array(z.strictObject({ id: topic, label: title }))
      .min(1)
      .max(3)
      .refine((choices) => new Set(choices.map((choice) => choice.id)).size === choices.length, {
        message: 'Choice identifiers must be unique.',
      }),
  }),
  z.strictObject({
    type: z.literal('show_outline'),
    title,
    parts: z.array(z.string().min(1).max(100)).min(1).max(3),
  }),
  z.strictObject({
    type: z.literal('propose_feedback'),
    quote: z.string().max(300),
    observation: z.string().min(1).max(160),
    nextStep: z.string().min(1).max(160),
    rubricId: z.literal('idea-and-reason-v1'),
    status: z.enum(['observed', 'needs_practice', 'not_observed', 'unassessable']),
  }),
  z.strictObject({
    type: z.literal('propose_next_mission'),
    missionId: z.literal('first-explanation'),
    title,
    text,
  }),
  z.strictObject({ type: z.literal('request_end_session'), text }),
]);

export const harnessReplySchema = z.strictObject({
  text: z.string().min(1).max(400),
  animation,
  panel: harnessPanelSchema.nullable(),
});

export const harnessConfigSchema = voiceLimitsSchema.extend({
  version: z.literal(harnessProtocolVersion),
  liveEnabled: z.boolean(),
});

export const harnessCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...command,
    type: z.literal('session.start'),
    locale,
    mode,
    topic,
    adultConfirmed: z.boolean(),
  }),
  z.strictObject({
    ...turnCommand,
    type: z.literal('turn.start'),
    sampleRate: z.int().min(8000).max(48000),
    channels: z.literal(1),
    encoding: z.literal('pcm_s16le'),
  }),
  z.strictObject({ ...turnCommand, type: z.literal('turn.commit') }),
  z.strictObject({ ...turnCommand, type: z.literal('turn.cancel') }),
  z.strictObject({
    ...turnCommand,
    type: z.literal('turn.text'),
    text: z.string().min(1).max(1000),
  }),
  z.strictObject({ ...turnCommand, type: z.literal('turn.action'), responseId, actionId }),
  z.strictObject({ ...turnCommand, type: z.literal('response.played'), responseId }),
  z.strictObject({ ...command, type: z.literal('panel.dismiss'), generation, responseId }),
  z.strictObject({ ...command, type: z.literal('session.close') }),
]);

export const harnessEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...header, type: z.literal('session.ready'), kind, limits: voiceLimitsSchema }),
  z.strictObject({
    ...turn,
    type: z.literal('transcript'),
    text: z.string().min(1).max(2000),
    final: z.boolean(),
  }),
  z.strictObject({
    ...turn,
    type: z.literal('turn.state'),
    state: z.enum(['listening', 'thinking', 'speaking', 'ready']),
  }),
  z.strictObject({
    ...response,
    ...harnessReplySchema.shape,
    type: z.literal('turn.response'),
    source: z.enum(['script', 'ai']),
  }),
  z.strictObject({ ...response, type: z.literal('audio.start'), format: z.literal('mp3') }),
  z.strictObject({ ...response, type: z.literal('audio.end'), bytes: z.int().min(1).max(524288) }),
  z.strictObject({
    ...response,
    type: z.literal('turn.metrics'),
    sttMs: metric,
    coachMs: metric,
    ttsMs: metric,
    totalMs: metric,
    audioSeconds: metric.max(30),
    inputTokens: count,
    outputTokens: count,
    ttsCharacters: count,
  }),
  z.strictObject({ ...turn, type: z.literal('turn.cancelled') }),
  z.strictObject({
    ...turn,
    type: z.literal('turn.audio.accepted'),
    bytes: z.int().min(1).max(2880000),
  }),
  z.strictObject({
    ...header,
    type: z.literal('error'),
    code: z.enum(['invalid_message', 'unavailable', 'limit', 'provider', 'unsafe', 'timeout']),
    message: z.string().min(1).max(200),
    recoverable: z.boolean(),
    turnId: turnId.optional(),
  }),
  z.strictObject({
    ...header,
    type: z.literal('session.closed'),
    reason: z.enum(['client', 'timeout', 'limit']),
  }),
]);

export type HarnessConfig = z.infer<typeof harnessConfigSchema>;
export type HarnessCommand = z.infer<typeof harnessCommandSchema>;
export type HarnessEvent = z.infer<typeof harnessEventSchema>;
export type HarnessPanel = z.infer<typeof harnessPanelSchema>;
export type HarnessAnimation = z.infer<typeof animation>;
export type HarnessActionId = z.infer<typeof actionId>;
export type HarnessReply = z.infer<typeof harnessReplySchema>;

export function parseHarnessConfig(input: unknown): HarnessConfig | null {
  const result = harnessConfigSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function parseHarnessEvent(input: unknown): HarnessEvent | null {
  const result = harnessEventSchema.safeParse(input);
  return result.success ? result.data : null;
}

// The provider schema is generated from the same validator used at the client boundary.
export function harnessReplyJsonSchema() {
  return z.toJSONSchema(harnessReplySchema, {
    override: ({ jsonSchema }) => {
      // Distinct panel type literals make anyOf equivalent and compatible with provider output schemas.
      if (jsonSchema.oneOf !== undefined) {
        jsonSchema.anyOf = jsonSchema.oneOf;
        delete jsonSchema.oneOf;
      }
    },
  });
}

export function harnessJsonSchema() {
  return z.toJSONSchema(
    z.strictObject({
      config: harnessConfigSchema,
      command: harnessCommandSchema,
      event: harnessEventSchema,
    }),
  );
}
