import { writeFileSync } from 'node:fs';

import { voiceJsonSchema } from './voice.ts';

// Regenerate the JSON contract from its canonical validators, never edit the output by hand.
writeFileSync(
  new URL('./voice.schema.json', import.meta.url),
  `${JSON.stringify(voiceJsonSchema(), null, 2)}\n`,
);
