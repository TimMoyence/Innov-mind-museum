import { useEffect } from 'react';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from './hooks/useReducedMotion';
import { useTheme } from './ThemeContext';
import { radius } from './tokens';

interface SkeletonBoxProps {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const SkeletonBox = ({
  width,
  height,
  borderRadius = radius.md,
  style,
}: SkeletonBoxProps) => {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 0.5 : 0.3);

  useEffect(() => {
    if (reduceMotion) {
      // WCAG 2.3.3: hold a static mid-opacity value instead of pulsing.
      opacity.value = 0.5;
      return;
    }
    opacity.value = withRepeat(
      withSequence(withTiming(0.7, { duration: 800 }), withTiming(0.3, { duration: 800 })),
      -1,
      false,
    );
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.inputBackground,
        },
        animatedStyle,
        style,
      ]}
    />
  );
};
