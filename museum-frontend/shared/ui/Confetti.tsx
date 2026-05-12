import type { ReactElement } from 'react';
import { memo, useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

interface ConfettiProps {
  count?: number;
  /** Origin point in screen coordinates; default = top-center. */
  origin?: { x: number; y: number };
  /** Total fall duration in ms (was `fallSpeed` in the legacy ConfettiCannon). */
  fallSpeed?: number;
  /** Fired once after the last particle has finished its animation. */
  onAnimationEnd?: () => void;
  testID?: string;
}

const PARTICLE_COLORS = ['#F94144', '#F8961E', '#F9C74F', '#90BE6D', '#43AA8B', '#577590', '#9B5DE5'];
const PARTICLE_SIZE = 8;
const GRAVITY_BAND = 80;

interface Particle {
  index: number;
  color: string;
  driftX: number;
  rotateEnd: number;
  delay: number;
}

const screen = Dimensions.get('window');

const makeParticles = (count: number): readonly Particle[] => {
  return Array.from({ length: count }, (_, index) => ({
    index,
    color: PARTICLE_COLORS[index % PARTICLE_COLORS.length] ?? '#FFFFFF',
    driftX: (Math.random() - 0.5) * screen.width,
    rotateEnd: 360 + Math.random() * 720,
    delay: Math.random() * GRAVITY_BAND,
  }));
};

const ConfettiParticle = memo(function ConfettiParticle({
  particle,
  origin,
  fallSpeed,
}: {
  particle: Particle;
  origin: { x: number; y: number };
  fallSpeed: number;
}) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: fallSpeed,
      easing: Easing.out(Easing.quad),
    });
    opacity.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(1, { duration: fallSpeed * 0.7 }),
      withTiming(0, { duration: fallSpeed * 0.3 }),
    );
  }, [progress, opacity, fallSpeed]);

  const style = useAnimatedStyle(() => {
    const fallY = (screen.height + PARTICLE_SIZE) * progress.value;
    const horizontalSwing = particle.driftX * progress.value;
    const rotateDeg = particle.rotateEnd * progress.value;
    return {
      opacity: opacity.value,
      transform: [
        { translateX: horizontalSwing },
        { translateY: fallY },
        { rotate: `${rotateDeg.toString()}deg` },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        { backgroundColor: particle.color, left: origin.x, top: origin.y },
        style,
      ]}
    />
  );
});

/**
 * One-shot confetti animation driven by Reanimated 4 — drop-in replacement for
 * react-native-confetti-cannon (unmaintained since 2022). Renders `count`
 * particles falling from `origin`, fading out by the end of `fallSpeed` ms.
 *
 * Callers should mount this conditionally and unmount once the animation
 * completes (matching the legacy showConfetti pattern). Use `onAnimationEnd`
 * if you want to trigger unmount automatically.
 */
export function Confetti({
  count = 80,
  origin,
  fallSpeed = 2500,
  onAnimationEnd,
  testID,
}: ConfettiProps): ReactElement {
  const finalOrigin = origin ?? { x: screen.width / 2, y: 0 };
  const particles = useMemo(() => makeParticles(count), [count]);

  const sentinel = useSharedValue(0);
  useEffect(() => {
    if (!onAnimationEnd) return;
    sentinel.value = withTiming(
      1,
      { duration: fallSpeed + GRAVITY_BAND, easing: Easing.linear },
      (finished) => {
        if (finished) scheduleOnRN(onAnimationEnd);
      },
    );
  }, [sentinel, fallSpeed, onAnimationEnd]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={testID}>
      {particles.map((particle) => (
        <ConfettiParticle
          key={particle.index}
          particle={particle}
          origin={finalOrigin}
          fallSpeed={fallSpeed}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    width: PARTICLE_SIZE,
    height: PARTICLE_SIZE,
    borderRadius: 1,
  },
});
