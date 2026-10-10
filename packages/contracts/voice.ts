import { z } from 'zod';

// Runtime validation and exported schemas share this bounded adult-lab wire contract.
export const voiceProtocolVersion = 1;

const localeSchema = z.enum(['id', 'en']);
const modeSchema = z.enum(['talk', 'practice']);
const topicSchema = z.enum(['hobby', 'day', 'ideas']);
const exampleSchema = z.enum(['reason', 'brief']);
const kindSchema = z.enum(['preview', 'live']);
const turnId = z.int().min(1).max(8);
const metric = z.number().nonnegative();
const count = z.int().nonnegative();
// Sequence orders session events, turnId scopes events to a specific audio turn.
const header = { version: z.literal(voiceProtocolVersion), sequence: z.int().positive() };
const turn = { ...header, turnId };

export const voiceLimitsSchema = z.strictObject({
  maxSessionSeconds: z.int().min(1).max(300),
  maxTurnSeconds: z.int().min(1).max(30),
  maxTurns: z.int().min(1).max(8),
});

export const voiceConfigSchema = voiceLimitsSchema.extend({
  version: z.literal(voiceProtocolVersion),
  liveEnabled: z.boolean(),
});

// Strict objects reject unknown fields rather than silently accepting protocol extensions.
export const voiceCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('session.start'),
    version: z.literal(voiceProtocolVersion),
    locale: localeSchema,
    mode: modeSchema,
    topic: topicSchema,
    adultConfirmed: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('turn.start'),
    turnId,
    sampleRate: z.int().min(8000).max(48000),
    channels: z.literal(1),
    encoding: z.literal('pcm_s16le'),
  }),
  z.strictObject({ type: z.literal('turn.commit'), turnId }),
  z.strictObject({ type: z.literal('turn.cancel'), turnId }),
  z.strictObject({ type: z.literal('demo.turn'), turnId, example: exampleSchema }),
  z.strictObject({ type: z.literal('session.close') }),
]);

export const voiceEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...header,
    type: z.literal('session.ready'),
    sessionId: z.string().min(1).max(128),
    kind: kindSchema,
    limits: voiceLimitsSchema,
  }),
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
    ...turn,
    type: z.literal('turn.response'),
    text: z.string().min(1).max(500),
    source: z.enum(['script', 'ai']),
  }),
  z.strictObject({ ...turn, type: z.literal('audio.start'), format: z.literal('mp3') }),
  z.strictObject({ ...turn, type: z.literal('audio.end'), bytes: z.int().min(1).max(524288) }),
  z.strictObject({
    ...turn,
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

export type VoiceLocale = z.infer<typeof localeSchema>;
export type VoiceMode = z.infer<typeof modeSchema>;
export type VoiceTopic = z.infer<typeof topicSchema>;
export type PreviewExample = z.infer<typeof exampleSchema>;
export type VoiceKind = z.infer<typeof kindSchema>;
export type VoiceLimits = z.infer<typeof voiceLimitsSchema>;
export type VoiceConfig = z.infer<typeof voiceConfigSchema>;
export type VoiceCommand = z.infer<typeof voiceCommandSchema>;
export type VoiceEvent = z.infer<typeof voiceEventSchema>;

// Untrusted HTTP data enters the app only after validation against the shared limits.
export function parseVoiceConfig(input: unknown): VoiceConfig | null {
  const result = voiceConfigSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function parseVoiceEvent(input: unknown): VoiceEvent | null {
  const result = voiceEventSchema.safeParse(input);
  return result.success ? result.data : null;
}

// Derive the published schema from runtime validators to prevent a second contract source.
export function voiceJsonSchema() {
  return z.toJSONSchema(
    z.strictObject({
      config: voiceConfigSchema,
      command: voiceCommandSchema,
      event: voiceEventSchema,
    }),
  );
}
