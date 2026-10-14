import assert from 'node:assert/strict';
import test from 'node:test';

import { parseDeviceTalkConfig } from './device-talk.ts';

const config = {
  version: 2,
  enabled: true,
  adultOnly: true,
  input: 'device',
  output: 'device',
  limits: { maxSessionSeconds: 300, maxTurnSeconds: 30, maxTurns: 8 },
};

void test('device conversation admission remains distinct from cloud voice and child access', () => {
  assert.deepEqual(parseDeviceTalkConfig(config), config);
  assert.deepEqual(parseDeviceTalkConfig({ ...config, enabled: false }), {
    ...config,
    enabled: false,
  });
  for (const invalid of [
    { ...config, adultOnly: false },
    { ...config, input: 'cloud' },
    { ...config, output: 'cloud' },
    { ...config, version: 1 },
    { ...config, liveEnabled: true },
    { ...config, limits: { ...config.limits, maxTurns: 100 } },
  ]) {
    assert.equal(parseDeviceTalkConfig(invalid), null);
  }
});
