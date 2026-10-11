import { useEffect, useId, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import encourage from '../../assets/morii-encourage.png';
import explain from '../../assets/morii-explain.png';
import listen from '../../assets/morii-listen.png';
import think from '../../assets/morii-think.png';
import wave from '../../assets/morii-wave.png';

const sources = {
  wave,
  listen,
  think,
  encourage,
  explain,
};

interface FootPosition {
  cx: number;
  cy: number;
}

// Ground contacts follow each pose's feet in the normalized image canvas.
const footPositions = {
  wave: [
    { cx: 40, cy: 92.5 },
    { cx: 66, cy: 92 },
  ],
  listen: [
    { cx: 46, cy: 92.5 },
    { cx: 70, cy: 91.8 },
  ],
  think: [
    { cx: 47, cy: 91.5 },
    { cx: 77, cy: 90 },
  ],
  encourage: [
    { cx: 38, cy: 94.5 },
    { cx: 70, cy: 93.5 },
  ],
  explain: [
    { cx: 40, cy: 93.2 },
    { cx: 66, cy: 92.2 },
  ],
} satisfies Record<keyof typeof sources, readonly [FootPosition, FootPosition]>;

const shadowColor = '#425C53';

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

// Real audio state takes priority over decorative gestures, motion never implies microphone access.
export function Morii({
  pose = 'wave',
  size = 260,
  state = 'idle',
  animation = 'neutral',
}: {
  pose?: keyof typeof sources;
  size?: number;
  state?: MoriiState;
  animation?: MoriiAnimation;
}) {
  const shadowId = useId();
  const [motion] = useState(() => new Animated.Value(0));
  const [reducedMotion, setReducedMotion] = useState(true);
  const shadowAccessibility =
    Platform.OS === 'web' ? { 'aria-hidden': true } : { accessible: false };
  const listening = state === 'listening';
  const speaking = state === 'speaking';
  const thinking =
    state === 'thinking' ||
    state === 'connecting' ||
    (!listening && !speaking && animation === 'think');
  const active = !['paused', 'error', 'ended'].includes(state);
  const expressive = speaking || animation === 'encourage' || animation === 'wave';
  const duration = speaking ? 1100 : thinking ? 1800 : 2200;
  const visiblePose = listening
    ? 'listen'
    : speaking
      ? 'explain'
      : thinking
        ? 'think'
        : animation === 'encourage'
          ? 'encourage'
          : animation === 'wave'
            ? 'wave'
            : pose;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => {
        if (mounted) setReducedMotion(enabled);
      },
      () => {
        if (mounted) setReducedMotion(true);
      },
    );
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      mounted = false;
      listener.remove();
    };
  }, []);

  useEffect(() => {
    motion.setValue(0);
    if (reducedMotion || !active) return;

    // A brief gesture settles within five seconds so the character does not compete with reading.
    const gesture = Animated.sequence([
      Animated.timing(motion, {
        toValue: 1,
        duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(motion, {
        toValue: 0,
        duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]);
    gesture.start();
    return () => {
      gesture.stop();
      motion.setValue(0);
    };
  }, [active, animation, duration, motion, reducedMotion, state]);

  return (
    <View className="max-w-full self-center" style={{ width: size, height: size }}>
      {/* A broad falloff and separate foot contacts keep the leg gap free of a dark hotspot. */}
      <Animated.View
        pointerEvents="none"
        className="absolute top-0 left-0"
        style={{
          width: size,
          height: size,
          opacity: motion.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] }),
          transform: [
            { scaleX: motion.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) },
          ],
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100" {...shadowAccessibility}>
          <Defs>
            <RadialGradient id={shadowId} r="50%" gradientUnits="objectBoundingBox">
              <Stop offset="0%" stopColor={shadowColor} stopOpacity={0.65} />
              <Stop offset="25%" stopColor={shadowColor} stopOpacity={0.6} />
              <Stop offset="50%" stopColor={shadowColor} stopOpacity={0.35} />
              <Stop offset="75%" stopColor={shadowColor} stopOpacity={0.09} />
              <Stop offset="100%" stopColor={shadowColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={52} cy={92} rx={44} ry={8} fill={`url(#${shadowId})`} opacity={0.14} />
          {footPositions[visiblePose].map(({ cx, cy }, index) => (
            <Ellipse
              key={index}
              cx={cx}
              cy={cy}
              rx={13}
              ry={3.5}
              fill={`url(#${shadowId})`}
              opacity={0.11}
            />
          ))}
        </Svg>
      </Animated.View>
      <Animated.View
        style={{
          width: size,
          height: size,
          transform: [
            { translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
            {
              scale: motion.interpolate({
                inputRange: [0, 1],
                outputRange: [1, expressive ? 1.014 : 1.006],
              }),
            },
            {
              rotate: motion.interpolate({
                inputRange: [0, 1],
                outputRange: ['-0.35deg', '0.35deg'],
              }),
            },
          ],
        }}
      >
        <Image
          source={sources[visiblePose]}
          className="size-full"
          resizeMode="contain"
          accessible={false}
        />
      </Animated.View>
    </View>
  );
}
