import React, { useEffect } from 'react';
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
import { semantic } from '@/shared/ui/tokens.semantic';
import { space, radius, fontSize } from '@/shared/ui/tokens.generated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface NavPreviewTab {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

export interface SlideData {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  bullets: string[];
  navPreviewTabs?: NavPreviewTab[];
}

interface OnboardingSlideProps {
  slide: SlideData;
}

/** Single onboarding slide with Reanimated entrance animations. */
export const OnboardingSlide = React.memo(function OnboardingSlide({
  slide,
}: OnboardingSlideProps) {
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
    <View
      style={[styles.slide, { width: SCREEN_WIDTH - 36 }]}
      accessibilityLabel={`${slide.title}. ${slide.subtitle}`}
    >
      <Animated.View style={animatedStyle}>
        <View style={styles.iconWrap}>
          <Ionicons name={slide.icon} size={48} color={theme.primary} />
        </View>

        <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
          {slide.title}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{slide.subtitle}</Text>

        {slide.navPreviewTabs ? (
          <View
            style={[
              styles.navPreview,
              { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
            ]}
          >
            {slide.navPreviewTabs.map((tab) => (
              <View key={tab.icon} style={styles.navTab}>
                <Ionicons name={tab.icon} size={20} color={theme.primary} />
                <Text style={[styles.navTabLabel, { color: theme.textSecondary }]}>
                  {tab.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <GlassCard style={styles.card} intensity={50}>
          {slide.bullets.map((bullet, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text
                style={[
                  styles.bulletNumber,
                  { color: theme.primary, backgroundColor: theme.primaryTint },
                ]}
              >
                {i + 1}
              </Text>
              <Text style={[styles.bulletText, { color: theme.textSecondary }]}>{bullet}</Text>
            </View>
          ))}
        </GlassCard>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  slide: {
    paddingHorizontal: semantic.card.paddingLarge,
    justifyContent: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: space['5'],
  },
  title: {
    fontSize: fontSize['2xl+'],
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: space['2'],
  },
  subtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: space['5'],
    marginBottom: space['5'],
  },
  navPreview: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space['6'],
    borderRadius: radius['2xl'],
    borderWidth: semantic.input.borderWidth,
    paddingVertical: space['2.5'],
    paddingHorizontal: semantic.screen.padding,
    marginBottom: semantic.section.gap,
  },
  navTab: {
    alignItems: 'center',
    gap: semantic.card.gapTiny,
  },
  navTabLabel: {
    fontSize: semantic.section.labelSize,
    fontWeight: '600',
  },
  card: {
    padding: semantic.card.padding,
    gap: semantic.card.gap,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: space['2.5'],
    alignItems: 'flex-start',
  },
  bulletNumber: {
    width: space['5.5'],
    height: space['5.5'],
    borderRadius: radius.DEFAULT,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: space['5.5'],
  },
  bulletText: {
    flex: 1,
    fontSize: semantic.form.labelSize,
    lineHeight: space['5'],
  },
});
