import { useEffect } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface SlideData {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  bullets: string[];
}

interface OnboardingSlideProps {
  slide: SlideData;
}

/** Single onboarding slide with Reanimated entrance animations. */
export const OnboardingSlide = ({ slide }: OnboardingSlideProps) => {
  const { theme } = useTheme();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    opacity.value = withDelay(100, withTiming(1, { duration: 400 }));
    translateY.value = withDelay(100, withTiming(0, { duration: 400 }));
  }, [opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <View style={[styles.slide, { width: SCREEN_WIDTH - 36 }]}>
      <Animated.View style={animatedStyle}>
        <View style={styles.iconWrap}>
          <Ionicons name={slide.icon} size={48} color={theme.primary} />
        </View>

        <Text style={[styles.title, { color: theme.textPrimary }]}>{slide.title}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{slide.subtitle}</Text>

        <GlassCard style={styles.card} intensity={50}>
          {slide.bullets.map((bullet, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bulletNumber, { color: theme.primary }]}>{i + 1}</Text>
              <Text style={[styles.bulletText, { color: theme.textSecondary }]}>{bullet}</Text>
            </View>
          ))}
        </GlassCard>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  slide: {
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  card: {
    padding: 16,
    gap: 12,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  bulletNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(30,64,175,0.1)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
});
