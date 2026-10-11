// Checks that each selectable lesson has complete bilingual guidance and a valid recognition task.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  findLesson,
  learningLessons,
  learningStages,
} from '../../../../../content/missions/presentation-foundations.ts';

void test('the first two stages contain four unique lessons each', () => {
  assert.equal(learningStages.length, 2);
  assert.equal(learningLessons.length, 8);
  assert.equal(new Set(learningLessons.map((lesson) => lesson.id)).size, 8);
  for (const stage of learningStages) {
    assert.equal(stage.lessons.length, 4);
    assert.ok(stage.lessons.every((lesson) => lesson.id.startsWith(stage.id)));
  }
});

void test('every lesson supports both languages and one valid task answer', () => {
  for (const lesson of learningLessons) {
    for (const locale of ['id', 'en'] satisfies readonly ('id' | 'en')[]) {
      const copy = lesson.locales[locale];
      assert.equal(copy.options.length, 3);
      assert.equal(new Set(copy.options).size, 3);
      assert.ok(copy.correctOption >= 0 && copy.correctOption < copy.options.length);
      for (const [field, text] of Object.entries(copy)) {
        if (field !== 'starter' && typeof text === 'string') assert.ok(text.trim().length > 0);
      }
      assert.ok(copy.example.length < 600);
      assert.ok(copy.prompt.length < 300);
      assert.ok(copy.selfCheck.length < 180);
    }
  }
});

void test('only the first lesson starts with an uncoached attempt', () => {
  assert.deepEqual(
    learningLessons.filter((lesson) => lesson.baseline).map((lesson) => lesson.id),
    ['clear-idea-1'],
  );
  assert.equal(findLesson('clear-idea-1')?.locales.id.starter, '');
});

void test('lookup rejects unknown, empty, and legacy harness mission IDs', () => {
  assert.equal(findLesson(''), undefined);
  assert.equal(findLesson('../../secrets'), undefined);
  assert.equal(findLesson('first-explanation'), undefined);
  assert.equal(findLesson('clear-explanation-4')?.locales.en.title, 'Connect it all');
});
