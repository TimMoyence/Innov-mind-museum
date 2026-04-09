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

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space } from '@/shared/ui/tokens.generated';

const DOT_SIZE = 8;
const DOT_COUNT = 3;
const ANIMATION_DURATION = 400;

const Dot = ({ delay, color }: { delay: number; color: string }) => {
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

  return <Animated.View style={[styles.dot, { backgroundColor: color }, animatedStyle]} />;
};

/** Displays an animated three-dot typing indicator shown while the assistant is generating a response. */
export const TypingIndicator = () => {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.assistantBubble,
          borderColor: theme.assistantBubbleBorder,
        },
      ]}
    >
      {Array.from({ length: DOT_COUNT }).map((_, index) => (
        <Dot key={index} delay={index * 160} color={theme.textSecondary} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['1'],
    alignSelf: 'flex-start',
    borderRadius: semantic.chat.bubbleRadius,
    padding: semantic.chat.bubblePaddingX,
    borderWidth: semantic.input.borderWidth,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
