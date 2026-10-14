import { AnimationMixer, LoopOnce, LoopRepeat, Mesh } from 'three';
import type { AnimationAction, AnimationClip, Object3D } from 'three';

import { blendSeconds, blinkWeight, clipNames, frameStep, gestureSeconds } from './motion.ts';
import type { MoriiClip } from './motion.ts';

interface Playback {
  name: MoriiClip;
  action: AnimationAction;
  weight: number;
  from: number;
  to: number;
}

interface MorphChannel {
  weights: number[];
  blink: number | undefined;
  mouth: number | undefined;
}

// Blend from current weights so a new request halfway through a gesture preserves the visible pose.
export class MoriiMotionPlayer {
  private readonly mixer: AnimationMixer;
  private readonly tracks: Playback[] = [];
  private readonly root: Object3D;
  private selected: MoriiClip = 'idle';
  private blendTime = blendSeconds;
  private clipTime = 0;
  private duration = 0;
  private running = false;
  private readonly faces: MorphChannel[] = [];

  constructor(root: Object3D, clips: readonly AnimationClip[]) {
    this.root = root;
    this.mixer = new AnimationMixer(root);
    root.traverse((node) => {
      if (!(node instanceof Mesh) || node.morphTargetInfluences === undefined) return;
      const blink = node.morphTargetDictionary?.['blink'];
      const mouth = node.morphTargetDictionary?.['mouthOpen'];
      if (blink !== undefined || mouth !== undefined) {
        this.faces.push({ weights: node.morphTargetInfluences, blink, mouth });
      }
    });
    for (const name of clipNames) {
      const clip = clips.find((candidate) => candidate.name === name);
      if (clip === undefined) continue;
      const action = this.mixer.clipAction(clip);
      const weight = name === 'idle' ? 1 : 0;
      this.tracks.push({ name, action, weight, from: weight, to: weight });
      if (name === 'idle') {
        action.play();
        action.paused = true;
        action.setEffectiveWeight(1);
      }
    }
    if (!this.tracks.some((track) => track.name === 'idle')) {
      throw new Error('Morii has no neutral animation');
    }
    this.mixer.update(0);
  }

  get clip(): MoriiClip {
    return this.selected;
  }

  get elapsed(): number {
    return this.clipTime;
  }

  setClip(name: MoriiClip): void {
    if (name === this.selected && (this.running || name === 'idle')) return;
    const selected = this.tracks.find((track) => track.name === name);
    if (selected === undefined) throw new Error(`Morii has no ${name} animation`);
    const clip = selected.action.getClip();
    this.selected = name;
    this.clipTime = 0;
    this.blendTime = 0;
    this.duration = name === 'speak' ? Infinity : gestureSeconds(clip.duration);
    this.running = true;

    for (const track of this.tracks) {
      track.from = track.weight;
      track.to = track === selected ? 1 : 0;
    }
    if (selected.weight === 0) selected.action.reset();
    selected.action.stopFading();
    selected.action.setLoop(
      name === 'speak' ? LoopRepeat : LoopOnce,
      name === 'speak' ? Infinity : 1,
    );
    selected.action.clampWhenFinished = true;
    selected.action.paused = name === 'idle';
    if (name === 'idle') selected.action.time = 0;
    selected.action.setEffectiveTimeScale(
      name === 'speak' || name === 'idle' ? 1 : clip.duration / this.duration,
    );
    selected.action.play();
  }

  // Returns whether another frame is needed, settled scenes stop consuming GPU frames.
  update(delta: number): boolean {
    if (!this.running) return false;
    const step = frameStep(delta);
    this.clipTime += step;
    this.blendTime += step;
    const progress = Math.min(1, this.blendTime / blendSeconds);
    const eased = progress * progress * (3 - 2 * progress);
    for (const track of this.tracks) {
      track.weight = track.from + (track.to - track.from) * eased;
      track.action.setEffectiveWeight(track.weight);
    }
    this.mixer.update(step);

    if (progress === 1) {
      for (const track of this.tracks) {
        if (track.to === 0 && track.action.isScheduled()) track.action.stop();
      }
      if (this.selected === 'idle') {
        this.running = false;
        return false;
      }
    }
    if (this.selected !== 'speak' && this.clipTime >= this.duration) this.setClip('idle');
    return true;
  }

  // Mouth motion indicates active TTS, it does not claim phoneme or captured-audio synchronization.
  updateFace(delta: number, expressive: boolean, speaking: boolean): boolean {
    const blink = expressive ? blinkWeight(this.clipTime) : 0;
    const mouth =
      expressive && speaking
        ? 0.26 + Math.sin(this.clipTime * 12) * 0.12 + Math.sin(this.clipTime * 7) * 0.06
        : 0;
    const smoothing = 1 - Math.exp(-frameStep(delta) * 24);
    let settling = false;
    for (const channel of this.faces) {
      if (channel.blink !== undefined) {
        const previous = channel.weights[channel.blink] ?? 0;
        const next = previous + (blink - previous) * smoothing;
        channel.weights[channel.blink] = Math.abs(blink - next) < 0.001 ? blink : next;
        settling ||= Math.abs(blink - next) >= 0.001;
      }
      if (channel.mouth !== undefined) {
        const previous = channel.weights[channel.mouth] ?? 0;
        const next = previous + (mouth - previous) * smoothing;
        channel.weights[channel.mouth] = Math.abs(mouth - next) < 0.001 ? mouth : next;
        settling ||= Math.abs(mouth - next) >= 0.001;
      }
    }
    return settling;
  }

  dispose(): void {
    this.running = false;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}
