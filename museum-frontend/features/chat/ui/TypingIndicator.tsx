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

import { useTranslation } from 'react-i18next';

import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

const DOT_SIZE = 8;
const DOT_COUNT = 3;
const ANIMATION_DURATION = 400;

interface DotProps {
  delay: number;
  color: string;
  reduceMotion: boolean;
}

const Dot = ({ delay, color, reduceMotion }: DotProps) => {
  const opacity = useSharedValue(reduceMotion ? 0.7 : 0.3);

  useEffect(() => {
    if (reduceMotion) {
      // WCAG 2.3.3: replace the pulsing sequence with a static mid-opacity dot.
      opacity.value = 0.7;
      return;
    }
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
  }, [delay, opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.dot, { backgroundColor: color }, animatedStyle]} />;
};

/** Displays an animated three-dot typing indicator shown while the assistant is generating a response. */
export const TypingIndicator = () => {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const { t } = useTranslation();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('chat.typing_announcement')}
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        {
          backgroundColor: theme.assistantBubble,
          borderColor: theme.assistantBubbleBorder,
        },
      ]}
    >
      {Array.from({ length: DOT_COUNT }).map((_, index) => (
        <Dot
          key={index}
          delay={index * 160}
          color={theme.textSecondary}
          reduceMotion={reduceMotion}
        />
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
