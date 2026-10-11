// Verifies civil-calendar habits without retaining exact practice timestamps.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PracticeActivity } from './practice-activity.ts';
import {
  decodePracticeActivity,
  deviceTimeZone,
  practiceDate,
  recordPractice,
  summarizePractice,
} from './practice-activity.ts';

const jakarta = 'Asia/Jakarta';
const newYork = 'America/New_York';

function at(iso: string): number {
  return Date.parse(iso);
}

function recordDays(dates: readonly string[], timeZone = jakarta): PracticeActivity {
  let activity: PracticeActivity | undefined;
  for (const date of dates) {
    activity = recordPractice(activity, { at: at(`${date}T12:00:00Z`), timeZone });
  }
  assert.ok(activity);
  return activity;
}

void test('device zone resolves to a usable civil date', () => {
  assert.equal(typeof practiceDate(at('2026-01-01T12:00:00Z'), deviceTimeZone()), 'string');
});

void test('Jakarta midnight changes the civil date before UTC midnight', () => {
  assert.equal(practiceDate(at('2026-01-01T16:59:59Z'), jakarta), '2026-01-01');
  assert.equal(practiceDate(at('2026-01-01T17:00:00Z'), jakarta), '2026-01-02');
});

void test('invalid moments and non-IANA zones cannot create activity', () => {
  for (const moment of [
    { at: Number.NaN, timeZone: jakarta },
    { at: Number.POSITIVE_INFINITY, timeZone: jakarta },
    { at: 9e15, timeZone: jakarta },
    { at: at('2026-01-01T12:00:00Z'), timeZone: 'Invalid/Zone' },
    { at: at('2026-01-01T12:00:00Z'), timeZone: '+07:00' },
  ]) {
    assert.equal(practiceDate(moment.at, moment.timeZone), undefined);
    assert.equal(recordPractice(undefined, moment), undefined);
  }
});

void test('first completion stores its date and zone without an exact timestamp', () => {
  const activity = recordDays(['2026-01-01']);
  assert.deepEqual(activity, {
    timeZone: jakarta,
    days: ['2026-01-01'],
    streakStart: '2026-01-01',
  });
});

void test('same-day replays and language changes remain one practiced day', () => {
  const activity = recordDays(['2026-01-01']);
  assert.equal(
    recordPractice(activity, { at: at('2026-01-01T16:59:00Z'), timeZone: jakarta }),
    activity,
  );
});

void test('travel cannot create a second day by changing the device zone', () => {
  const activity = recordDays(['2026-01-01']);
  assert.equal(
    recordPractice(activity, { at: at('2026-01-01T15:30:00Z'), timeZone: 'Asia/Tokyo' }),
    activity,
  );
  const next = recordPractice(activity, {
    at: at('2026-01-01T17:30:00Z'),
    timeZone: 'America/Los_Angeles',
  });
  assert.ok(next);
  assert.equal(next.timeZone, jakarta);
  assert.deepEqual(next.days, ['2026-01-01', '2026-01-02']);
});

void test('short and long daylight-saving days preserve consecutive practice', () => {
  for (const [first, second, expectedDate] of [
    ['2026-03-07T17:00:00Z', '2026-03-08T16:00:00Z', '2026-03-08'],
    ['2026-10-31T16:00:00Z', '2026-11-01T17:00:00Z', '2026-11-01'],
  ]) {
    assert.ok(first && second && expectedDate);
    const activity = recordPractice(undefined, { at: at(first), timeZone: newYork });
    const next = recordPractice(activity, { at: at(second), timeZone: newYork });
    assert.equal(next?.days.at(-1), expectedDate);
    assert.equal(summarizePractice(next, at(second), newYork).streak, 2);
  }
});

void test('leap days and month and year transitions use calendar adjacency', () => {
  for (const dates of [
    ['2024-02-28', '2024-02-29', '2024-03-01'],
    ['2026-04-30', '2026-05-01', '2026-05-02'],
    ['2026-12-31', '2027-01-01', '2027-01-02'],
  ]) {
    const activity = recordDays(dates);
    const latest = dates.at(-1);
    assert.ok(latest);
    assert.equal(summarizePractice(activity, at(`${latest}T12:00:00Z`), jakarta).streak, 3);
  }
});

void test('a calendar gap starts a new streak and a clock rollback is ignored', () => {
  const activity = recordDays(['2026-01-01', '2026-01-03']);
  assert.equal(activity.streakStart, '2026-01-03');
  assert.equal(summarizePractice(activity, at('2026-01-03T12:00:00Z'), jakarta).streak, 1);
  assert.equal(
    recordPractice(activity, { at: at('2026-01-02T12:00:00Z'), timeZone: jakarta }),
    activity,
  );
});

void test('bounded history preserves a streak beyond fourteen practiced days', () => {
  const dates = Array.from(
    { length: 21 },
    (_, index) => `2026-01-${String(index + 1).padStart(2, '0')}`,
  );
  const activity = recordDays(dates);
  assert.equal(activity.days.length, 14);
  assert.equal(activity.days[0], '2026-01-08');
  assert.equal(activity.streakStart, '2026-01-01');
  assert.equal(summarizePractice(activity, at('2026-01-21T12:00:00Z'), jakarta).streak, 21);
  assert.deepEqual(decodePracticeActivity(activity), activity);
  const resumed = recordPractice(activity, { at: at('2026-01-23T12:00:00Z'), timeZone: jakarta });
  assert.equal(resumed?.streakStart, '2026-01-23');
});

void test('a persisted valid record round-trips without unbounded history', () => {
  const activity = recordDays(['2026-01-01', '2026-01-02', '2026-01-04']);
  assert.deepEqual(decodePracticeActivity(activity), activity);
  assert.deepEqual(Object.keys(activity).sort(), ['days', 'streakStart', 'timeZone']);
});

void test('malformed records and non-canonical dates are rejected', () => {
  const valid = recordDays(['2026-01-01']);
  const invalid: readonly unknown[] = [
    null,
    [],
    '',
    {},
    { ...valid, at: 123 },
    { ...valid, timeZone: 'Not/AZone' },
    { ...valid, timeZone: '+07:00' },
    { ...valid, days: [] },
    { ...valid, days: ['2026-1-1'] },
    { ...valid, days: ['2026-02-29'], streakStart: '2026-02-29' },
    { ...valid, days: ['2026-04-31'], streakStart: '2026-04-31' },
    { ...valid, days: ['0000-01-01'], streakStart: '0000-01-01' },
    { ...valid, days: ['2026-01-02', '2026-01-01'] },
    { ...valid, days: ['2026-01-01', '2026-01-01'] },
    { ...valid, days: [7] },
    { ...valid, days: Array<string>(15).fill('2026-01-01') },
    { ...valid, streakStart: '2026-01-02' },
    Object.create(valid, {
      unrelated: { value: true, enumerable: true },
      days: { value: ['2026-01-01'], enumerable: true },
      extra: { value: true, enumerable: true },
    }),
  ];
  for (const value of invalid) assert.equal(decodePracticeActivity(value), undefined);
});

void test('observed gaps cannot claim a continuous streak', () => {
  for (const activity of [
    { timeZone: jakarta, days: ['2026-01-01', '2026-01-03'], streakStart: '2026-01-01' },
    { timeZone: jakarta, days: ['2026-01-01', '2026-01-02'], streakStart: '2026-01-02' },
    { timeZone: jakarta, days: ['2026-01-04', '2026-01-05'], streakStart: '2026-01-01' },
    { timeZone: jakarta, days: ['2026-01-01', '2026-01-04'], streakStart: '2026-01-03' },
  ]) {
    assert.equal(decodePracticeActivity(activity), undefined);
  }
});

void test('the current week runs Monday through Sunday across a year boundary', () => {
  const activity = recordDays(['2025-12-28', '2025-12-29', '2025-12-31', '2026-01-01']);
  const summary = summarizePractice(activity, at('2026-01-01T12:00:00Z'), jakarta);
  assert.deepEqual(
    summary.week.map((day) => day.date),
    [
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ],
  );
  assert.deepEqual(
    summary.week.filter((day) => day.completed).map((day) => day.date),
    ['2025-12-29', '2025-12-31', '2026-01-01'],
  );
  assert.equal(summary.weeklyDays, 3);
  assert.equal(summary.week.filter((day) => day.today).length, 1);
  assert.equal(summary.practicedToday, true);
});

void test('a streak remains available yesterday and expires after a full skipped day', () => {
  const activity = recordDays(['2026-01-01', '2026-01-02']);
  assert.equal(summarizePractice(activity, at('2026-01-03T12:00:00Z'), jakarta).streak, 2);
  assert.equal(summarizePractice(activity, at('2026-01-04T12:00:00Z'), jakarta).streak, 0);
});

void test('summary uses the anchored zone after travel', () => {
  const activity = recordDays(['2026-01-01']);
  const summary = summarizePractice(activity, at('2026-01-01T15:30:00Z'), 'Asia/Tokyo');
  assert.equal(summary.today, '2026-01-01');
  assert.equal(summary.practicedToday, true);
});

void test('a future stored day reports a clock change without rewarding that day', () => {
  const activity = recordDays(['2026-01-01', '2026-01-02']);
  const summary = summarizePractice(activity, at('2026-01-01T12:00:00Z'), jakarta);
  assert.equal(summary.clockChanged, true);
  assert.equal(summary.streak, 0);
  assert.equal(summary.weeklyDays, 1);
  assert.equal(summary.week.find((day) => day.date === '2026-01-02')?.completed, false);
});

void test('empty and invalid summary moments remain safe and ordinary', () => {
  const summary = summarizePractice(undefined, at('2026-10-11T12:00:00Z'), jakarta);
  assert.equal(summary.today, '2026-10-11');
  assert.equal(summary.week.length, 7);
  assert.equal(summary.weeklyDays, 0);
  assert.equal(summary.streak, 0);
  assert.equal(summary.practicedToday, false);
  assert.equal(summary.clockChanged, false);
  const invalid = summarizePractice(undefined, Number.NaN, 'Invalid/Zone');
  assert.equal(invalid.week.length, 7);
  assert.equal(invalid.weeklyDays, 0);
  assert.equal(invalid.streak, 0);
});
