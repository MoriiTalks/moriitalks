import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isSequenceCorrect, toggleSequenceCard } from './sequence-model.ts';

void test('a learner can remove an earlier selection and rebuild the order without duplicates', () => {
  let selection = [2, 0, 1];
  selection = toggleSequenceCard(selection, 2);
  assert.deepEqual(selection, [0, 1]);
  assert.equal(isSequenceCorrect(selection, 3), false);
  selection = toggleSequenceCard(selection, 2);
  assert.deepEqual(selection, [0, 1, 2]);
  assert.equal(isSequenceCorrect(selection, 3), true);
});

void test('only a complete ordered sequence passes, including four-part presentations', () => {
  assert.equal(isSequenceCorrect([0, 1, 2, 3], 4), true);
  for (const selection of [[], [0, 1, 2], [1, 0, 2, 3], [0, 1, 2, 2], [0, 1, 2, 3, 4]]) {
    assert.equal(isSequenceCorrect(selection, 4), false);
  }
});
