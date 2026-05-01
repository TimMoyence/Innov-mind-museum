import type { ReactElement } from 'react';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';

const DOT_DURATION = 600;
const DOT_STAGGER = 200;

interface AnimatedDotProps {
  delay: number;
  color: string;
  reduceMotion: boolean;
}

function AnimatedDot({ delay, color, reduceMotion }: AnimatedDotProps): ReactElement {
  const opacity = useSharedValue(reduceMotion ? 0.7 : 0.3);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 0.7;
      return;
    }
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: DOT_DURATION / 2, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: DOT_DURATION / 2, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );
  }, [delay, opacity, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

interface SkeletonBubbleProps {
  color: string;
  reduceMotion: boolean;
}

function SkeletonBubble({ color, reduceMotion }: SkeletonBubbleProps): ReactElement {
  const opacity = useSharedValue(reduceMotion ? 0.5 : 0.3);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 0.5;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [opacity, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.skeleton, { backgroundColor: color }, style]} />;
}

export interface TypingPlaceholderProps {
  /** When true, shows the skeleton bubble + dots. When false, renders nothing. */
  visible: boolean;
  testID?: string;
}

/** Assistant slot component: pulsing skeleton bubble + 3-dot animation while pending/streaming. */
export function TypingPlaceholder({
  visible,
  testID,
}: TypingPlaceholderProps): ReactElement | null {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();

  if (!visible) return null;

  return (
    <View
      style={styles.container}
      testID={testID}
      accessibilityLiveRegion="polite"
      accessibilityLabel={t('chat.typing.label')}
    >
      <SkeletonBubble color={theme.surface} reduceMotion={reduceMotion} />
      <View style={styles.dotsRow}>
        <AnimatedDot delay={0} color={theme.textSecondary} reduceMotion={reduceMotion} />
        <AnimatedDot delay={DOT_STAGGER} color={theme.textSecondary} reduceMotion={reduceMotion} />
        <AnimatedDot
          delay={DOT_STAGGER * 2}
          color={theme.textSecondary}
          reduceMotion={reduceMotion}
        />
        <Text style={[styles.label, { color: theme.textSecondary }]}>{t('chat.typing.label')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  skeleton: { width: '70%', height: 60, borderRadius: 16 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 13, marginLeft: 8 },
});
