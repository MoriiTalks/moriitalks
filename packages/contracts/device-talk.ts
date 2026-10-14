import { z } from 'zod';

import { voiceLimitsSchema } from './voice.ts';

// Device speech is an explicit adult lab capability, separate from paid cloud audio.
export const deviceTalkConfigSchema = z.strictObject({
  version: z.literal(2),
  enabled: z.boolean(),
  adultOnly: z.literal(true),
  input: z.literal('device'),
  output: z.literal('device'),
  limits: voiceLimitsSchema,
});

export type DeviceTalkConfig = z.infer<typeof deviceTalkConfigSchema>;

export function parseDeviceTalkConfig(input: unknown): DeviceTalkConfig | null {
  const result = deviceTalkConfigSchema.safeParse(input);
  return result.success ? result.data : null;
}
