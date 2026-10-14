import { useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useId, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Image, Platform, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import encourage from '../../assets/morii-encourage.png';
import explain from '../../assets/morii-explain.png';
import listen from '../../assets/morii-listen.png';
import think from '../../assets/morii-think.png';
import wave from '../../assets/morii-wave.png';
import type { MoriiProps } from './morii/motion';
import { portraitPose } from './morii/portrait';

export type { MoriiAnimation, MoriiProp, MoriiProps, MoriiState } from './morii/motion';

const sources = { wave, listen, think, encourage, explain };
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
} satisfies Record<keyof typeof sources, readonly { cx: number; cy: number }[]>;

// The original portraits remain the only runtime art, brief native transforms add gentle movement.
export const Morii = memo(function Morii({
  pose = 'wave',
  size = 260,
  state = 'idle',
  animation = 'neutral',
  quiet = false,
}: MoriiProps) {
  const shadowId = useId();
  const [motion] = useState(() => new Animated.Value(0));
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const visiblePose = portraitPose({ pose, state, animation, quiet });
  const active = visible && !quiet && !['paused', 'error', 'ended'].includes(state);
  const speaking = state === 'speaking';
  const expressive = speaking || animation === 'encourage' || animation === 'wave';
  const duration = speaking ? 1100 : visiblePose === 'think' ? 1800 : 2200;
  const accessibility =
    Platform.OS === 'web'
      ? { 'aria-hidden': true }
      : { accessible: false, accessibilityElementsHidden: true };

  useFocusEffect(
    useCallback(() => {
      let focused = true;
      void Promise.resolve().then(() => {
        if (focused) setVisible(AppState.currentState === 'active');
      });
      const listener = AppState.addEventListener('change', (next) => {
        if (focused) setVisible(next === 'active');
      });
      return () => {
        focused = false;
        listener.remove();
        setVisible(false);
      };
    }, []),
  );

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

    // One bounded gesture settles within five seconds and stops when the screen becomes inactive.
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
    <View
      pointerEvents="none"
      className="max-w-full self-center"
      style={{ width: size, height: size }}
      {...accessibility}
    >
      <Animated.View
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
        {/* A broad falloff and separate foot contacts avoid a dark spot between the legs. */}
        <Svg width="100%" height="100%" viewBox="0 0 100 100" {...accessibility}>
          <Defs>
            <RadialGradient id={shadowId} r="50%" gradientUnits="objectBoundingBox">
              <Stop offset="0%" stopColor="#425C53" stopOpacity={0.65} />
              <Stop offset="25%" stopColor="#425C53" stopOpacity={0.6} />
              <Stop offset="50%" stopColor="#425C53" stopOpacity={0.35} />
              <Stop offset="75%" stopColor="#425C53" stopOpacity={0.09} />
              <Stop offset="100%" stopColor="#425C53" stopOpacity={0} />
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
          {...accessibility}
        />
      </Animated.View>
    </View>
  );
});
