import assert from 'node:assert/strict';
import { test } from 'node:test';

import { talkVoiceControl } from './talk-control.ts';

void test('preparing recognition cannot act like a pause or restart capture', () => {
  const control = talkVoiceControl('connecting', true);
  assert.equal(control.action, null);
  assert.equal(control.icon, 'mic');
  assert.equal(control.label, 'preparing');
  assert.equal(control.disabled, true);
});

void test('listening pauses capture while a paused call can resume', () => {
  assert.equal(talkVoiceControl('listening', true).action, 'pause');
  assert.equal(talkVoiceControl('listening', true).icon, 'pause');
  assert.equal(talkVoiceControl('paused', true).action, 'resume');
  assert.equal(talkVoiceControl('ready', true).action, 'resume');
});

void test('speaking and thinking offer a microphone interruption rather than ending the call', () => {
  for (const status of ['thinking', 'speaking'] as const) {
    const control = talkVoiceControl(status, true);
    assert.equal(control.action, 'interrupt');
    assert.equal(control.icon, 'mic');
    assert.equal(control.label, 'interrupt');
    assert.equal(control.disabled, false);
  }
});

void test('unsupported recognition prevents starting capture but still permits interruption', () => {
  assert.equal(talkVoiceControl('ready', false).disabled, true);
  assert.equal(talkVoiceControl('speaking', false).disabled, false);
});

void test('a paused reply can replay even when speech recognition is unavailable', () => {
  const control = talkVoiceControl('paused', false, true);
  assert.equal(control.action, 'resume');
  assert.equal(control.label, 'replay');
  assert.equal(control.disabled, false);
});
