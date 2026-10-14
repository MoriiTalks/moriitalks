import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HarnessCommand, HarnessEvent, HarnessPanel } from '@contracts/harness';

import { DeviceTalkSession } from './device-talk-session.ts';
import type { DeviceTalkDriver, RecognitionCallbacks } from './device-talk-session.ts';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function fixture() {
  const commands: HarnessCommand[] = [];
  const captures: { callbacks: RecognitionCallbacks; stops: number; aborts: number }[] = [];
  const playback: Parameters<DeviceTalkDriver['speak']>[2][] = [];
  let receive: (event: HarnessEvent) => void = () => undefined;
  let permission = () => Promise.resolve(true);
  let drain = () => Promise.resolve();
  let permissions = 0;
  let closed = 0;
  let stopFails = false;
  let notifications = 0;
  let disconnected: () => void = () => undefined;
  const driver: DeviceTalkDriver = {
    connect: (_signal, callbacks) => {
      receive = callbacks.event;
      disconnected = callbacks.failed;
      return Promise.resolve({
        send: (command) => commands.push(command),
        close: () => {
          closed += 1;
        },
      });
    },
    permission: () => {
      permissions += 1;
      return permission();
    },
    recognize: (_locale, callbacks) => {
      const capture = { callbacks, stops: 0, aborts: 0 };
      captures.push(capture);
      return {
        stop: () => {
          if (stopFails) throw new Error('Native recognizer unavailable');
          capture.stops += 1;
        },
        abort: () => {
          capture.aborts += 1;
          return drain();
        },
      };
    },
    speak: (_text, _locale, callbacks) => {
      playback.push(callbacks);
    },
    stopSpeech: () => undefined,
  };
  const session = new DeviceTalkSession('id', driver, () => {
    notifications += 1;
  });
  let sequence = 0;
  function ready() {
    receive({
      version: 2,
      type: 'session.ready',
      sequence: ++sequence,
      sessionId: 'session-a',
      generation: 0,
      kind: 'live',
      limits: { maxTurns: 8, maxTurnSeconds: 30, maxSessionSeconds: 300 },
    });
  }
  function response(turnId = 1, panel: HarnessPanel | null = null) {
    receive({
      version: 2,
      type: 'turn.response',
      sequence: ++sequence,
      sessionId: 'session-a',
      generation: turnId,
      turnId,
      responseId: `reply-${String(turnId)}`,
      text: 'Tambahkan satu contoh tentang tanaman.',
      source: 'ai',
      animation: 'encourage',
      panel,
    });
  }
  function turnReady(turnId = 1) {
    receive({
      version: 2,
      type: 'turn.state',
      sequence: ++sequence,
      sessionId: 'session-a',
      generation: turnId,
      turnId,
      state: 'ready',
    });
  }
  function failure(
    code: Extract<HarnessEvent, { type: 'error' }>['code'],
    recoverable: boolean,
    turnId = 1,
  ) {
    receive({
      version: 2,
      type: 'error',
      sequence: ++sequence,
      sessionId: 'session-a',
      generation: turnId,
      turnId,
      code,
      recoverable,
      message: 'This turn could not be completed. Please try again.',
    });
  }
  function transcript(text: string, turnId = 1) {
    receive({
      version: 2,
      type: 'transcript',
      sequence: ++sequence,
      sessionId: 'session-a',
      generation: turnId,
      turnId,
      text,
      final: true,
    });
  }
  return {
    session,
    commands,
    captures,
    playback,
    ready,
    response,
    turnReady,
    failure,
    transcript,
    disconnect: () => {
      disconnected();
    },
    setPermission: (value: () => Promise<boolean>) => {
      permission = value;
    },
    setDrain: (value: () => Promise<void>) => {
      drain = value;
    },
    permissions: () => permissions,
    closed: () => closed,
    notifications: () => notifications,
    failStop: () => {
      stopFails = true;
    },
  };
}

for (const voice of [false, true]) {
  void test(`connecting with voice ${String(voice)} cannot assign a task without input`, async () => {
    const f = fixture();
    try {
      await f.session.connect(voice);
      f.ready();
      await tick();
      assert.equal(f.session.snapshot().connected, true);
      assert.equal(f.captures.length, voice ? 1 : 0);
      f.response(1, { type: 'show_hint', title: 'Unrequested task', text: 'Explain a new topic.' });
      assert.equal(f.commands.length, 0);
      assert.equal(f.playback.length, 0);
      assert.equal(f.session.snapshot().response, '');
      assert.equal(f.session.snapshot().panel, null);
      assert.equal(f.session.snapshot().remainingTurns, 8);
    } finally {
      f.session.end();
    }
  });
}

void test('typed connection never requests microphone access, completed speech is acknowledged once', async () => {
  const f = fixture();
  try {
    await f.session.connect(false);
    f.ready();
    assert.equal(f.session.snapshot().connected, true);
    await tick();
    assert.equal(f.permissions(), 0);
    f.session.submitText('Saya ingin berlatih presentasi.');
    f.response();
    f.turnReady();
    assert.equal(f.session.snapshot().status, 'thinking');
    f.playback[0]?.started();
    f.playback[0]?.finished();
    f.playback[0]?.finished();
    await tick();
    assert.equal(f.session.snapshot().status, 'ready');
    assert.equal(f.session.snapshot().responsePending, false);
    assert.equal(f.commands.filter((command) => command.type === 'response.played').length, 1);
    assert.equal(f.permissions(), 0);
  } finally {
    f.session.end();
    assert.equal(f.session.snapshot().connected, false);
  }
});

const recoverableCodes: ('provider' | 'unsafe' | 'timeout')[] = ['provider', 'unsafe', 'timeout'];

for (const code of recoverableCodes) {
  void test(`a recoverable ${code} error preserves the session, stale callbacks cannot replace an explicit retry`, async (context) => {
    const f = fixture();
    context.mock.timers.enable({ apis: ['setTimeout'] });
    try {
      await f.session.connect(true);
      f.ready();
      await tick();
      const first = f.captures[0];
      assert.ok(first);
      first.callbacks.started();
      first.callbacks.result('Bantu saya menjelaskan tanaman.', true);
      first.callbacks.ended();
      f.response(1, { type: 'show_hint', title: 'Penjelasan', text: 'Berikan satu contoh.' });
      f.turnReady();
      f.playback[0]?.started();
      f.failure(code, true);
      assert.equal(f.session.snapshot().connected, true);
      assert.equal(f.session.snapshot().status, 'ready');
      assert.equal(f.session.snapshot().voiceActive, false);
      assert.equal(f.session.snapshot().remainingTurns, 7);
      assert.equal(f.session.snapshot().transcript, 'Bantu saya menjelaskan tanaman.');
      assert.equal(f.session.snapshot().response, '');
      assert.equal(f.session.snapshot().responsePending, false);
      assert.equal(f.session.snapshot().responseId, null);
      assert.equal(f.session.snapshot().panel, null);
      assert.equal(f.session.snapshot().animation, 'neutral');
      assert.ok(f.session.snapshot().error);
      assert.equal(f.closed(), 0);

      first.callbacks.result('Late words', true);
      first.callbacks.ended();
      f.playback[0]?.finished();
      f.playback[0]?.failed();
      f.response();
      f.turnReady();
      context.mock.timers.tick(30001);
      await tick();
      assert.equal(f.captures.length, 1);
      assert.equal(f.playback.length, 1);
      assert.equal(f.session.snapshot().connected, true);
      assert.equal(f.session.snapshot().response, '');
      assert.equal(f.commands.length, 1);

      f.session.submitText('Sekarang bantu pembukaan presentasi.');
      const retry = f.commands[1];
      assert.ok(retry?.type === 'turn.text');
      assert.equal(retry.turnId, 2);
      assert.equal(f.session.snapshot().remainingTurns, 6);
      assert.equal(f.session.snapshot().error, null);
      f.failure(code, true);
      assert.equal(f.session.snapshot().status, 'thinking');
      f.response(2);
      f.turnReady(2);
      f.playback[1]?.started();
      f.playback[1]?.finished();
      await tick();
      assert.equal(f.session.snapshot().status, 'ready');
      assert.equal(f.session.snapshot().responseId, 'reply-2');
      assert.equal(f.commands[2]?.type, 'response.played');
      assert.equal(f.captures.length, 1);
      assert.equal(f.closed(), 0);
    } finally {
      f.session.end();
      context.mock.timers.reset();
    }
  });
}

void test('protocol, admission, nonrecoverable, and connection errors still close the session', async () => {
  const failures: {
    code: Extract<HarnessEvent, { type: 'error' }>['code'];
    recoverable: boolean;
  }[] = [
    { code: 'provider', recoverable: false },
    { code: 'unsafe', recoverable: false },
    { code: 'timeout', recoverable: false },
    { code: 'invalid_message', recoverable: true },
    { code: 'unavailable', recoverable: true },
    { code: 'limit', recoverable: true },
  ];
  for (const failure of failures) {
    const f = fixture();
    try {
      await f.session.connect(false);
      f.ready();
      f.session.submitText('Bantu saya latihan.');
      f.failure(failure.code, failure.recoverable);
      assert.equal(f.session.snapshot().connected, false);
      assert.equal(f.session.snapshot().status, 'error');
      assert.equal(f.closed(), 1);
    } finally {
      f.session.end();
    }
  }
  const f = fixture();
  try {
    await f.session.connect(false);
    f.ready();
    f.disconnect();
    assert.equal(f.session.snapshot().connected, false);
    assert.equal(f.session.snapshot().status, 'error');
    assert.equal(f.closed(), 1);
  } finally {
    f.session.end();
  }
});

void test('identical recognition results and server echoes do not publish unchanged transcripts', async () => {
  const f = fixture();
  try {
    await f.session.connect(true);
    f.ready();
    await tick();
    const capture = f.captures[0];
    assert.ok(capture);
    capture.callbacks.started();
    const before = f.notifications();
    for (let index = 0; index < 10; index += 1)
      capture.callbacks.result('  Saya suka tanaman.  ', false);
    assert.equal(f.notifications(), before + 1);
    capture.callbacks.result('Saya suka tanaman.', true);
    assert.equal(f.notifications(), before + 1);
    assert.equal(capture.stops, 1);
    capture.callbacks.ended();
    const sent = f.notifications();
    f.transcript('Saya suka tanaman.');
    f.transcript('Saya suka tanaman.');
    assert.equal(f.notifications(), sent);
    f.transcript('Saya suka menanam bunga.');
    assert.equal(f.notifications(), sent + 1);
    assert.equal(f.session.snapshot().transcript, 'Saya suka menanam bunga.');
    assert.equal(f.commands.length, 1);
  } finally {
    f.session.end();
  }
});

void test('interrupting a pending model turn also cancels its deadline', async (context) => {
  const f = fixture();
  context.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    await f.session.connect(false);
    f.ready();
    f.session.submitText('Bantu saya berlatih.');
    f.session.interrupt();
    context.mock.timers.tick(30001);
    assert.equal(f.session.snapshot().connected, true);
    assert.equal(f.session.snapshot().status, 'ready');
    assert.equal(f.session.snapshot().error, null);
    assert.equal(f.commands[1]?.type, 'turn.cancel');
  } finally {
    f.session.end();
    context.mock.timers.reset();
  }
});

void test('a synchronous native stop failure pauses the call without sending partial speech', async () => {
  const f = fixture();
  try {
    await f.session.connect(true);
    f.ready();
    await tick();
    f.captures[0]?.callbacks.started();
    f.captures[0]?.callbacks.result('Ucapan belum selesai', false);
    f.failStop();
    assert.doesNotThrow(() => {
      f.session.finishVoice();
    });
    assert.equal(f.session.snapshot().voiceActive, false);
    assert.equal(f.session.snapshot().remainingTurns, 8);
    assert.equal(f.commands.length, 0);
    f.captures[0]?.callbacks.result('Late final words', true);
    assert.equal(f.commands.length, 0);
  } finally {
    f.session.end();
  }
});

void test('a voice call submits one final utterance after native end, then rearms only after audible completion', async () => {
  const f = fixture();
  try {
    await f.session.connect(true);
    f.ready();
    await tick();
    const first = f.captures[0];
    assert.ok(first);
    first.callbacks.started();
    first.callbacks.result('Saya suka', false);
    assert.equal(f.commands.length, 0);
    first.callbacks.result('Saya suka membaca.', true);
    first.callbacks.result('Duplicate words', true);
    assert.equal(first.stops, 1);
    assert.equal(f.commands.length, 0);
    first.callbacks.ended();
    assert.equal(f.commands[0]?.type, 'turn.text');
    assert.equal(f.session.snapshot().transcript, 'Saya suka membaca.');
    first.callbacks.ended();
    first.callbacks.result('Stale words', true);
    assert.equal(f.commands.length, 1);
    f.response();
    f.turnReady();
    await tick();
    assert.equal(f.captures.length, 1);
    f.playback[0]?.started();
    await tick();
    assert.equal(f.captures.length, 1);
    f.playback[0]?.finished();
    await tick();
    assert.equal(f.captures.length, 2);
    assert.equal(f.commands[1]?.type, 'response.played');
  } finally {
    f.session.end();
  }
});

void test('an open harness panel prevents rearming without losing the active call intent', async () => {
  const f = fixture();
  try {
    await f.session.connect(true);
    f.ready();
    await tick();
    f.captures[0]?.callbacks.result('Beri contoh pembukaan.', true);
    f.captures[0]?.callbacks.ended();
    f.response(1, { type: 'show_hint', title: 'Pembukaan', text: 'Sebutkan topik presentasi.' });
    f.turnReady();
    f.playback[0]?.started();
    f.playback[0]?.finished();
    await tick();
    assert.equal(f.captures.length, 1);
    assert.equal(f.session.snapshot().voiceActive, true);
    f.session.dismissPanel();
    await tick();
    assert.equal(f.captures.length, 2);
  } finally {
    f.session.end();
  }
});

void test('permission completions after ending or pausing cannot start native capture', async () => {
  const f = fixture();
  const permission = Promise.withResolvers<boolean>();
  f.setPermission(() => permission.promise);
  try {
    await f.session.connect(true);
    f.ready();
    await tick();
    assert.equal(f.permissions(), 1);
    f.session.pause();
    permission.resolve(true);
    await tick();
    assert.equal(f.captures.length, 0);
    assert.equal(f.session.snapshot().voiceActive, false);
    f.session.startVoice();
    await tick();
    assert.equal(f.captures.length, 1);
    f.session.end();
    f.captures[0]?.callbacks.result('Late words', true);
    f.captures[0]?.callbacks.ended();
    assert.equal(f.commands.length, 0);
    assert.equal(f.session.snapshot().status, 'ended');
  } finally {
    f.session.end();
  }
});

void test('capture cancellation drains before a resumed recognizer can own new callbacks', async () => {
  const f = fixture();
  const drain = Promise.withResolvers<undefined>();
  f.setDrain(() => drain.promise);
  try {
    await f.session.connect(true);
    f.ready();
    await tick();
    const old = f.captures[0];
    assert.ok(old);
    old.callbacks.started();
    f.session.pause();
    f.session.resume();
    await tick();
    assert.equal(f.captures.length, 1);
    old.callbacks.result('Cancelled text', true);
    old.callbacks.ended();
    drain.resolve(undefined);
    await tick();
    assert.equal(f.captures.length, 2);
    assert.equal(f.commands.length, 0);
    assert.equal(old.aborts, 1);
  } finally {
    drain.resolve(undefined);
    f.session.end();
  }
});

void test('empty speech retries once, then pauses without a model request or a hot loop', async () => {
  const f = fixture();
  try {
    await f.session.connect(true);
    f.ready();
    await tick();
    f.captures[0]?.callbacks.failed('empty');
    await tick();
    assert.equal(f.captures.length, 2);
    f.captures[1]?.callbacks.failed('empty');
    await tick();
    assert.equal(f.captures.length, 2);
    assert.equal(f.commands.length, 0);
    assert.equal(f.session.snapshot().remainingTurns, 8);
    assert.equal(f.session.snapshot().voiceActive, false);
    assert.ok(f.session.snapshot().error?.includes('Tekan mikrofon'));
  } finally {
    f.session.end();
  }
});

void test('failed or never-started speech stays unread until explicit text continuation', async () => {
  const f = fixture();
  try {
    await f.session.connect(false);
    f.ready();
    f.session.submitText('Saya ingin latihan.');
    f.response();
    f.turnReady();
    f.playback[0]?.finished();
    assert.equal(f.session.snapshot().responsePending, true);
    assert.equal(f.commands.filter((command) => command.type === 'response.played').length, 0);
    f.session.resume();
    await tick();
    assert.equal(f.captures.length, 0);
    f.session.continueText();
    assert.equal(f.session.snapshot().responsePending, false);
    assert.equal(f.commands[1]?.type, 'response.played');
    f.session.resume();
    await tick();
    assert.equal(f.captures.length, 1);
  } finally {
    f.session.end();
  }
});

void test('interrupted model output cannot restore panels or play over a later turn', async () => {
  const f = fixture();
  try {
    await f.session.connect(false);
    f.ready();
    f.session.submitText('Tolong bantu pembukaan.');
    f.session.interrupt();
    assert.equal(f.commands[1]?.type, 'turn.cancel');
    f.response();
    f.turnReady();
    assert.equal(f.playback.length, 0);
    f.session.submitText('Sekarang bantu penutup.');
    assert.equal(f.commands[2]?.type, 'turn.text');
    f.response(2);
    assert.equal(f.playback.length, 1);
    assert.equal(f.session.snapshot().responseId, 'reply-2');
  } finally {
    f.session.end();
  }
});

void test('pause stops speech, stale completion cannot acknowledge it or restart the call', async () => {
  const f = fixture();
  try {
    await f.session.connect(true);
    f.ready();
    await tick();
    f.captures[0]?.callbacks.result('Saya ingin latihan.', true);
    f.captures[0]?.callbacks.ended();
    f.response();
    f.turnReady();
    f.playback[0]?.started();
    f.session.pause();
    f.playback[0]?.finished();
    await tick();
    assert.equal(f.captures.length, 1);
    assert.equal(f.session.snapshot().voiceActive, false);
    assert.equal(f.session.snapshot().responsePending, true);
    assert.equal(f.commands.filter((command) => command.type === 'response.played').length, 0);
    assert.equal(f.session.snapshot().status, 'ready');
  } finally {
    f.session.end();
  }
});
