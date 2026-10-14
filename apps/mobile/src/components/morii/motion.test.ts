import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, Group, NumberKeyframeTrack } from 'three';

import { MoriiMotionPlayer } from './animation.ts';
import {
  frameStep,
  gestureSeconds,
  maxGestureSeconds,
  motionClip,
  shouldRenderStage,
} from './motion.ts';
import type { StageProps } from './motion.ts';

const base: Omit<StageProps, 'size' | 'prop'> = {
  pose: 'wave',
  state: 'ready',
  animation: 'neutral',
  quiet: false,
  reducedMotion: false,
};

void test('audio state controls the rig while quiet, reduced motion, and ended sessions stay neutral', () => {
  assert.equal(motionClip({ ...base, state: 'listening', animation: 'encourage' }), 'listen');
  assert.equal(motionClip({ ...base, state: 'speaking', animation: 'think' }), 'speak');
  assert.equal(motionClip({ ...base, state: 'thinking', animation: 'wave' }), 'think');
  assert.equal(motionClip({ ...base, state: 'speaking', reducedMotion: true }), 'idle');
  assert.equal(motionClip({ ...base, state: 'listening', quiet: true }), 'idle');
  assert.equal(motionClip({ ...base, state: 'ended', animation: 'wave' }), 'idle');
});

void test('offscreen stages and small thumbnails never request a graphics renderer', () => {
  assert.equal(shouldRenderStage(420, false), false);
  assert.equal(shouldRenderStage(80, true), false);
  assert.equal(shouldRenderStage(NaN, true), false);
  assert.equal(shouldRenderStage(260, true), true);
  assert.equal(frameStep(2), 0.05);
  assert.equal(frameStep(-1), 0);
  assert.equal(frameStep(NaN), 0);
  assert.ok(gestureSeconds(100) < maxGestureSeconds);
});

function player() {
  const root = new Group();
  const clips = [
    new AnimationClip('idle', 1, [new NumberKeyframeTrack('.rotation[z]', [0, 1], [0, 0])]),
    new AnimationClip('wave', 20, [new NumberKeyframeTrack('.rotation[z]', [0, 20], [1, 1])]),
    new AnimationClip('think', 1, [new NumberKeyframeTrack('.rotation[z]', [0, 1], [-0.5, -0.5])]),
    new AnimationClip('speak', 1, [new NumberKeyframeTrack('.rotation[z]', [0, 1], [0.25, 0.25])]),
  ];
  return { root, motion: new MoriiMotionPlayer(root, clips) };
}

void test('a reversed request midway through a blend preserves the current pose', () => {
  const { root, motion } = player();
  motion.setClip('wave');
  motion.update(0.05);
  motion.update(0.05);
  const before = root.rotation.z;
  motion.setClip('think');
  motion.update(0);
  assert.ok(Math.abs(root.rotation.z - before) < 0.00001);
  motion.update(0.01);
  assert.ok(Math.abs(root.rotation.z - before) < 0.01);
  motion.dispose();
});

void test('long decorative clips settle within the motion budget and stop requesting frames', () => {
  const { root, motion } = player();
  motion.setClip('wave');
  let elapsed = 0;
  while (motion.update(0.01)) {
    elapsed += 0.01;
    assert.ok(elapsed <= maxGestureSeconds + 0.02);
  }
  assert.equal(motion.clip, 'idle');
  assert.equal(root.rotation.z, 0);
  assert.equal(motion.update(1), false);
  motion.dispose();
});

void test('speaking continues until explicitly stopped and disposal cancels further updates', () => {
  const { motion } = player();
  motion.setClip('speak');
  for (let index = 0; index < 200; index += 1) assert.equal(motion.update(0.05), true);
  motion.setClip('idle');
  for (let index = 0; index < 7; index += 1) motion.update(0.05);
  assert.equal(motion.update(0.05), false);
  motion.setClip('wave');
  motion.dispose();
  assert.equal(motion.update(0.05), false);
});
