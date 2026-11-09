import { Animated } from 'react-native';

export const fadeIn = (opacity: Animated.Value, reduceMotion: boolean, duration: number): void => {
  if (reduceMotion) {
    opacity.setValue(1);
    return;
  }
  Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }).start();
};
