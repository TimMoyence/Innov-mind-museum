import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';

const DOT_SIZE = 8;
const DOT_COUNT = 3;
const ANIMATION_DURATION = 400;

const Dot = ({ delay }: { delay: number }) => {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: ANIMATION_DURATION }),
          withTiming(0.3, { duration: ANIMATION_DURATION }),
        ),
        -1,
      ),
    );
  }, [delay, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
};

/** Displays an animated three-dot typing indicator shown while the assistant is generating a response. */
export const TypingIndicator = () => {
  return (
    <View style={styles.container}>
      {Array.from({ length: DOT_COUNT }).map((_, index) => (
        <Dot key={index} delay={index * 160} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#64748B',
  },
});
