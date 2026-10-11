// Verifies local progress remains bounded, language-specific, and safe during asynchronous hydration.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { learningLessons } from '../../../../content/missions/presentation-foundations.ts';
import {
  canStartLesson,
  decodeProgress,
  emptyProgress,
  initialProgressState,
  nextLesson,
  progressReducer,
} from './progress-model.ts';

void test('only the first lesson is available on a new path', () => {
  assert.equal(nextLesson([])?.id, 'clear-idea-1');
  assert.equal(canStartLesson('clear-idea-1', []), true);
  assert.equal(canStartLesson('clear-idea-2', []), false);
  assert.equal(canStartLesson('clear-explanation-1', []), false);
  assert.equal(canStartLesson('unknown', []), false);
});

void test('completing a stage unlocks the next stage and preserves replays', () => {
  const completed = ['clear-idea-1', 'clear-idea-2', 'clear-idea-3', 'clear-idea-4'];
  assert.equal(nextLesson(completed)?.id, 'clear-explanation-1');
  assert.equal(canStartLesson('clear-explanation-1', completed), true);
  assert.equal(canStartLesson('clear-idea-1', completed), true);
  assert.equal(canStartLesson('clear-explanation-2', completed), false);
  assert.equal(nextLesson(learningLessons.map((lesson) => lesson.id)), undefined);
});

void test('completion cannot skip steps or record arbitrary identifiers', () => {
  const state = initialProgressState();
  assert.equal(progressReducer(state, { type: 'complete', lessonId: 'unknown' }), state);
  assert.equal(progressReducer(state, { type: 'complete', lessonId: 'clear-idea-2' }), state);
  const complete = progressReducer(state, { type: 'complete', lessonId: 'clear-idea-1' });
  assert.deepEqual(complete.progress.completions.id, ['clear-idea-1']);
  assert.equal(progressReducer(complete, { type: 'complete', lessonId: 'clear-idea-1' }), complete);
});

void test('language paths are independent and the legacy mission does not unlock lessons', () => {
  let state = progressReducer(initialProgressState(), {
    type: 'complete',
    lessonId: 'clear-idea-1',
  });
  state = progressReducer(state, { type: 'locale', locale: 'en' });
  state = progressReducer(state, { type: 'complete', lessonId: 'first-explanation' });
  assert.deepEqual(state.progress.completions.id, ['clear-idea-1']);
  assert.deepEqual(state.progress.completions.en, ['first-explanation']);
  assert.equal(nextLesson(state.progress.completions.en)?.id, 'clear-idea-1');
});

void test('a saved record round-trips only version, locale, and self-reported completions', () => {
  const progress = emptyProgress();
  assert.deepEqual(decodeProgress(JSON.stringify(progress)), progress);
  assert.deepEqual(Object.keys(progress).sort(), ['completions', 'locale', 'version']);
});

void test('malformed, oversized, and future-version storage cannot hydrate state', () => {
  for (const raw of [
    null,
    '',
    '{',
    'null',
    '[]',
    JSON.stringify({ ...emptyProgress(), version: 2 }),
    JSON.stringify({ ...emptyProgress(), locale: 'fr' }),
    JSON.stringify({ ...emptyProgress(), completions: { id: [7], en: [] } }),
    JSON.stringify({ ...emptyProgress(), completions: { id: 'clear-idea-1', en: [] } }),
    JSON.stringify({
      ...emptyProgress(),
      completions: { id: Array<string>(100).fill('clear-idea-1'), en: [] },
    }),
    ' '.repeat(8193),
  ]) {
    assert.equal(decodeProgress(raw), undefined);
  }
});

void test('unknown IDs, duplicates, and completion gaps never unlock later work', () => {
  const decoded = decodeProgress(
    JSON.stringify({
      ...emptyProgress(),
      completions: {
        id: ['unknown', 'clear-idea-1', 'clear-idea-1', 'clear-idea-3'],
        en: ['clear-explanation-4'],
      },
    }),
  );
  assert.ok(decoded);
  assert.deepEqual(decoded.completions.id, ['clear-idea-1']);
  assert.deepEqual(decoded.completions.en, []);
  assert.equal(nextLesson(decoded.completions.id)?.id, 'clear-idea-2');
});

void test('a late disk read preserves early language changes and reported completion', () => {
  const saved = {
    ...emptyProgress(),
    completions: { id: ['clear-idea-1', 'clear-idea-2'], en: [] },
  };
  let state = progressReducer(initialProgressState(), { type: 'locale', locale: 'en' });
  state = progressReducer(state, { type: 'complete', lessonId: 'clear-idea-1' });
  state = progressReducer(state, { type: 'hydrate', saved, unavailable: false });
  assert.equal(state.progress.locale, 'en');
  assert.deepEqual(state.progress.completions.id, ['clear-idea-1', 'clear-idea-2']);
  assert.deepEqual(state.progress.completions.en, ['clear-idea-1']);
  assert.equal(state.storageStatus, 'saving');
  assert.equal(
    progressReducer(state, { type: 'hydrate', saved: emptyProgress(), unavailable: false }),
    state,
  );
});

void test('a reset before hydration prevents old completions from returning', () => {
  const saved = {
    ...emptyProgress(),
    completions: { id: ['clear-idea-1'], en: ['clear-idea-1'] },
  };
  let state = progressReducer(initialProgressState(), { type: 'locale', locale: 'en' });
  state = progressReducer(state, { type: 'reset' });
  state = progressReducer(state, { type: 'complete', lessonId: 'clear-idea-1' });
  state = progressReducer(state, { type: 'hydrate', saved, unavailable: false });
  assert.equal(state.progress.locale, 'en');
  assert.deepEqual(state.progress.completions.id, []);
  assert.deepEqual(state.progress.completions.en, ['clear-idea-1']);
});

void test('storage failures preserve in-memory practice and can recover after a later write', () => {
  let state = progressReducer(initialProgressState(), {
    type: 'complete',
    lessonId: 'clear-idea-1',
  });
  state = progressReducer(state, { type: 'hydrate', saved: undefined, unavailable: true });
  assert.equal(state.storageStatus, 'saving');
  assert.deepEqual(state.progress.completions.id, ['clear-idea-1']);
  state = progressReducer(state, { type: 'storage', revision: state.revision, unavailable: false });
  assert.equal(state.storageStatus, 'loaded');
  state = progressReducer(state, { type: 'reset' });
  assert.deepEqual(state.progress.completions, { id: [], en: [] });
});

void test('a failed read without user actions does not request a fallback write', () => {
  const state = progressReducer(initialProgressState(), {
    type: 'hydrate',
    saved: undefined,
    unavailable: true,
  });
  assert.equal(state.revision, 0);
  assert.equal(state.storageStatus, 'unavailable');
  const updated = progressReducer(state, { type: 'complete', lessonId: 'clear-idea-1' });
  assert.equal(updated.revision, 1);
});

void test('only the latest queued save can confirm or fail a pending mutation', () => {
  let state = progressReducer(initialProgressState(), {
    type: 'hydrate',
    saved: emptyProgress(),
    unavailable: false,
  });
  state = progressReducer(state, { type: 'complete', lessonId: 'clear-idea-1' });
  assert.equal(state.storageStatus, 'saving');
  const previousRevision = state.revision;
  state = progressReducer(state, { type: 'locale', locale: 'en' });
  assert.equal(
    progressReducer(state, { type: 'storage', revision: previousRevision, unavailable: false }),
    state,
  );
  assert.equal(
    progressReducer(state, { type: 'storage', revision: previousRevision, unavailable: true }),
    state,
  );
  state = progressReducer(state, { type: 'storage', revision: state.revision, unavailable: true });
  assert.equal(state.storageStatus, 'unavailable');
  state = progressReducer(state, { type: 'reset' });
  assert.equal(state.storageStatus, 'saving');
  state = progressReducer(state, { type: 'storage', revision: state.revision, unavailable: false });
  assert.equal(state.storageStatus, 'loaded');
});
