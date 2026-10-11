import { writeFileSync } from 'node:fs';

import { harnessJsonSchema, harnessReplyJsonSchema } from './harness.ts';
import { voiceJsonSchema } from './voice.ts';

// Regenerate the JSON contract from its canonical validators, never edit the output by hand.
writeFileSync(
  new URL('./voice.schema.json', import.meta.url),
  `${JSON.stringify(voiceJsonSchema(), null, 2)}\n`,
);
writeFileSync(
  new URL('./harness.schema.json', import.meta.url),
  `${JSON.stringify(harnessJsonSchema(), null, 2)}\n`,
);
writeFileSync(
  new URL('../../services/api/internal/voice/harness_reply.schema.json', import.meta.url),
  `${JSON.stringify(harnessReplyJsonSchema(), null, 2)}\n`,
);
