import type { MoriiAnimation, MoriiPose, MoriiState } from './motion';

// Actual audio state takes precedence over the harness's decorative expression.
export function portraitPose({
  pose,
  state,
  animation,
  quiet,
}: {
  pose: MoriiPose;
  state: MoriiState;
  animation: MoriiAnimation;
  quiet: boolean;
}): MoriiPose {
  if (quiet || state === 'paused' || state === 'error' || state === 'ended') return pose;
  if (state === 'listening') return 'listen';
  if (state === 'speaking') return 'explain';
  if (state === 'thinking' || state === 'connecting') return 'think';
  if (animation !== 'neutral') return animation;
  return pose;
}
