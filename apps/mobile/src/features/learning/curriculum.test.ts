// Checks bilingual practice guidance and the content consumed by each preparation format.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  findLesson,
  learningLessons,
  learningStages,
} from '../../../../../content/missions/presentation-foundations.ts';

void test('four stages contain four unique lessons each', () => {
  assert.equal(learningStages.length, 4);
  assert.equal(learningLessons.length, 16);
  assert.equal(new Set(learningLessons.map((lesson) => lesson.id)).size, 16);
  for (const stage of learningStages) {
    assert.equal(stage.lessons.length, 4);
    assert.ok(stage.lessons.every((lesson) => lesson.id.startsWith(stage.id)));
  }
});

void test('the original foundation lesson IDs keep their order as the path grows', () => {
  assert.deepEqual(
    learningLessons.slice(0, 8).map((lesson) => lesson.id),
    [
      'clear-idea-1',
      'clear-idea-2',
      'clear-idea-3',
      'clear-idea-4',
      'clear-explanation-1',
      'clear-explanation-2',
      'clear-explanation-3',
      'clear-explanation-4',
    ],
  );
});

void test('every lesson provides two distinct spoken contexts and valid preparation in both languages', () => {
  for (const lesson of learningLessons) {
    for (const locale of ['id', 'en'] satisfies readonly ('id' | 'en')[]) {
      const copy = lesson.locales[locale];
      const exercise = copy.exercise;
      if (exercise.kind === 'choice') {
        assert.equal(exercise.options.length, 3);
        assert.equal(new Set(exercise.options).size, 3);
        assert.ok(exercise.correctOption >= 0 && exercise.correctOption < exercise.options.length);
      } else if (exercise.kind === 'sequence') {
        assert.ok(exercise.items.length >= 3 && exercise.items.length <= 4);
        assert.equal(new Set(exercise.items).size, exercise.items.length);
        assert.ok(exercise.items.every((item) => item.trim().length > 0));
      }
      if (exercise.kind !== 'speak') {
        assert.ok(exercise.question.trim().length > 0);
        assert.ok(exercise.success.trim().length > 0);
        assert.ok(exercise.hint.trim().length > 0);
      }
      assert.equal(copy.practices.length, 2);
      assert.notEqual(copy.practices[0].prompt, copy.practices[1].prompt);
      for (const practice of copy.practices) {
        assert.ok(practice.prompt.trim().length > 0 && practice.prompt.length < 300);
        assert.ok(practice.selfCheck.trim().length > 0 && practice.selfCheck.length < 180);
      }
      for (const [field, text] of Object.entries(copy)) {
        if (field !== 'starter' && typeof text === 'string') assert.ok(text.trim().length > 0);
      }
      assert.ok(copy.example.length < 600);
    }
  }
});

void test('only the first lesson starts with an uncoached attempt', () => {
  assert.deepEqual(
    learningLessons.filter((lesson) => lesson.baseline).map((lesson) => lesson.id),
    ['clear-idea-1'],
  );
});

void test('lookup rejects unknown, empty, and legacy harness mission IDs', () => {
  assert.equal(findLesson(''), undefined);
  assert.equal(findLesson('../../secrets'), undefined);
  assert.equal(findLesson('first-explanation'), undefined);
  assert.equal(findLesson('clear-explanation-4')?.id, 'clear-explanation-4');
});
