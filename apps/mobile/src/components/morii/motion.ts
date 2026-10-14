export type MoriiState =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'paused'
  | 'error'
  | 'ended';

export type MoriiAnimation = 'neutral' | 'wave' | 'think' | 'encourage';
export type MoriiPose = 'wave' | 'listen' | 'think' | 'encourage' | 'explain';
export type MoriiProp = 'none' | 'idea-card';

export interface MoriiProps {
  pose?: MoriiPose;
  size?: number;
  state?: MoriiState;
  animation?: MoriiAnimation;
  quiet?: boolean;
  prop?: MoriiProp;
}

export interface StageProps {
  pose: MoriiPose;
  size: number;
  state: MoriiState;
  animation: MoriiAnimation;
  quiet: boolean;
  reducedMotion: boolean;
  prop: MoriiProp;
}

export interface StageRenderProps extends StageProps {
  onUnavailable: () => void;
}

export type MoriiClip =
  | 'idle'
  | 'wave'
  | 'listen'
  | 'think'
  | 'speak'
  | 'encourage'
  | 'move_left'
  | 'move_right'
  | 'move_forward'
  | 'move_backward'
  | 'reset';

export const clipNames: readonly MoriiClip[] = [
  'idle',
  'wave',
  'listen',
  'think',
  'speak',
  'encourage',
  'move_left',
  'move_right',
  'move_forward',
  'move_backward',
  'reset',
];

export const blendSeconds = 0.3;
export const maxGestureSeconds = 4.4;

// Audio state wins over decoration, quiet and reduced-motion modes keep the neutral pose.
export function motionClip({
  pose,
  state,
  animation,
  quiet,
  reducedMotion,
}: Omit<StageProps, 'size' | 'prop'>): MoriiClip {
  if (quiet || reducedMotion || state === 'paused' || state === 'error' || state === 'ended') {
    return 'idle';
  }
  if (state === 'speaking') return 'speak';
  if (state === 'listening') return 'listen';
  if (state === 'thinking' || state === 'connecting') return 'think';
  if (animation === 'wave') return 'wave';
  if (animation === 'think') return 'think';
  if (animation === 'encourage') return 'encourage';
  if (state === 'idle' && pose === 'wave') return 'wave';
  return 'idle';
}

export function shouldRenderStage(size: number, visible: boolean): boolean {
  return visible && Number.isFinite(size) && size >= 180;
}

export function gestureSeconds(duration: number): number {
  return Math.max(0.05, Math.min(duration, maxGestureSeconds - blendSeconds));
}

// A delayed frame cannot jump the rig after graphics initialization or an interrupted frame.
export function frameStep(delta: number): number {
  return Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.05)) : 0;
}

export function blinkWeight(seconds: number): number {
  const distance = Math.abs((seconds % 4.4) - 1.7);
  return distance < 0.14 ? Math.sin((1 - distance / 0.14) * Math.PI * 0.5) : 0;
}
