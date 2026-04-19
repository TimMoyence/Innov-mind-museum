import { useEffect } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, semantic, space } from '@/shared/ui/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type PillarIcon = keyof typeof Ionicons.glyphMap;

const PILLARS = [
  {
    icon: 'camera-outline',
    labelKey: 'onboarding.v2.slide2.pillar_photo',
    a11yKey: 'onboarding.v2.slide2.pillar_photo_a11y',
  },
  {
    icon: 'mic-outline',
    labelKey: 'onboarding.v2.slide2.pillar_voice',
    a11yKey: 'onboarding.v2.slide2.pillar_voice_a11y',
  },
  {
    icon: 'map-outline',
    labelKey: 'onboarding.v2.slide2.pillar_guide',
    a11yKey: 'onboarding.v2.slide2.pillar_guide_a11y',
  },
] as const satisfies readonly {
  icon: PillarIcon;
  labelKey: string;
  a11yKey: string;
}[];

const PillarRow = ({
  icon,
  label,
  a11yLabel,
  delay,
  reduceMotion,
}: {
  icon: PillarIcon;
  label: string;
  a11yLabel: string;
  delay: number;
  reduceMotion: boolean;
}) => {
  const { theme } = useTheme();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateX = useSharedValue(reduceMotion ? 0 : -16);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateX.value = 0;
      return;
    }
    opacity.value = withDelay(delay, withTiming(1, { duration: 380 }));
    translateX.value = withDelay(delay, withTiming(0, { duration: 380 }));
  }, [delay, opacity, translateX, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.pillarRow,
        { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
        animatedStyle,
      ]}
      accessible
      accessibilityLabel={a11yLabel}
    >
      <View style={[styles.iconWrap, { backgroundColor: theme.primaryTint }]}>
        <Ionicons name={icon} size={28} color={theme.primary} />
      </View>
      <Text style={[styles.pillarLabel, { color: theme.textPrimary }]} numberOfLines={3}>
        {label}
      </Text>
    </Animated.View>
  );
};

/** Slide 2 of onboarding v2: three value pillars (photo / voice / guide) with staggered entry. */
export const ValuePropSlide = () => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  return (
    <View style={[styles.slide, { width: SCREEN_WIDTH - 36 }]}>
      <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
        {t('onboarding.v2.slide2.title')}
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        {t('onboarding.v2.slide2.subtitle')}
      </Text>

      <View style={styles.pillarList}>
        {PILLARS.map((pillar, index) => (
          <PillarRow
            key={pillar.icon}
            icon={pillar.icon}
            label={t(pillar.labelKey)}
            a11yLabel={t(pillar.a11yKey)}
            delay={index * 120}
            reduceMotion={reduceMotion}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  slide: {
    paddingHorizontal: semantic.card.paddingLarge,
    justifyContent: 'center',
  },
  title: {
    fontSize: semantic.section.titleSizeLarge,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: space['2'],
  },
  subtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: space['5'],
    marginBottom: space['6'],
  },
  pillarList: {
    gap: semantic.card.gap,
  },
  pillarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gap,
    padding: semantic.card.padding,
    borderRadius: semantic.card.radius,
    borderWidth: semantic.input.borderWidth,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: semantic.card.radiusCompact,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarLabel: {
    flex: 1,
    fontSize: semantic.card.bodySize,
    fontWeight: '600',
    lineHeight: space['5'],
  },
});
