import { useEffect } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, semantic, space } from '@/shared/ui/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ChipIcon = keyof typeof Ionicons.glyphMap;

export const ONBOARDING_CHIPS = [
  {
    id: 'museum',
    labelKey: 'onboarding.v2.slide3.chip_museum_label',
    promptKey: 'onboarding.v2.slide3.chip_museum_prompt',
    icon: 'location-outline',
  },
  {
    id: 'masterpiece',
    labelKey: 'onboarding.v2.slide3.chip_masterpiece_label',
    promptKey: 'onboarding.v2.slide3.chip_masterpiece_prompt',
    icon: 'color-palette-outline',
  },
  {
    id: 'tour',
    labelKey: 'onboarding.v2.slide3.chip_tour_label',
    promptKey: 'onboarding.v2.slide3.chip_tour_prompt',
    icon: 'walk-outline',
  },
] as const satisfies readonly {
  id: 'museum' | 'masterpiece' | 'tour';
  labelKey: string;
  promptKey: string;
  icon: ChipIcon;
}[];

export type ChipDefinition = (typeof ONBOARDING_CHIPS)[number];

interface FirstPromptChipsSlideProps {
  onChipPress: (args: { id: ChipDefinition['id']; prompt: string }) => void;
  onSkip: () => void;
  disabled?: boolean;
}

/** Slide 3 of onboarding v2: three full-width prompt chips that seed a first chat, plus a skip CTA. */
export const FirstPromptChipsSlide = ({
  onChipPress,
  onSkip,
  disabled = false,
}: FirstPromptChipsSlideProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  return (
    <View style={[styles.slide, { width: SCREEN_WIDTH - 36 }]}>
      <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
        {t('onboarding.v2.slide3.title')}
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        {t('onboarding.v2.slide3.subtitle')}
      </Text>

      <View style={styles.chipList}>
        {ONBOARDING_CHIPS.map((chip, index) => (
          <AnimatedChip
            key={chip.id}
            chip={chip}
            label={t(chip.labelKey)}
            prompt={t(chip.promptKey)}
            disabled={disabled}
            delay={index * 110}
            reduceMotion={reduceMotion}
            onPress={onChipPress}
          />
        ))}
      </View>

      <Pressable
        style={styles.skipCta}
        onPress={() => {
          void Haptics.selectionAsync();
          onSkip();
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.v2.slide3.skip_cta_a11y')}
      >
        <Text style={[styles.skipText, { color: theme.placeholderText }]}>
          {t('onboarding.v2.slide3.skip_cta')}
        </Text>
      </Pressable>
    </View>
  );
};

interface AnimatedChipProps {
  chip: ChipDefinition;
  label: string;
  prompt: string;
  disabled: boolean;
  delay: number;
  reduceMotion: boolean;
  onPress: FirstPromptChipsSlideProps['onChipPress'];
}

const AnimatedChip = ({
  chip,
  label,
  prompt,
  disabled,
  delay,
  reduceMotion,
  onPress,
}: AnimatedChipProps) => {
  const { theme } = useTheme();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 14);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = withDelay(delay, withTiming(1, { duration: 360 }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 360 }));
  }, [delay, opacity, translateY, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        style={[
          styles.chip,
          {
            backgroundColor: theme.cardBackground,
            borderColor: theme.primaryBorderSubtle,
          },
          disabled && styles.chipDisabled,
        ]}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress({ id: chip.id, prompt });
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={prompt}
        testID={`onboarding-chip-${chip.id}`}
      >
        <View style={[styles.chipIcon, { backgroundColor: theme.primaryTint }]}>
          <Ionicons name={chip.icon} size={22} color={theme.primary} />
        </View>
        <View style={styles.chipBody}>
          <Text style={[styles.chipLabel, { color: theme.textPrimary }]} numberOfLines={2}>
            {label}
          </Text>
          <Text style={[styles.chipPrompt, { color: theme.textSecondary }]} numberOfLines={2}>
            {prompt}
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={18} color={theme.primary} />
      </Pressable>
    </Animated.View>
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
  chipList: {
    gap: semantic.card.gap,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gap,
    padding: semantic.card.padding,
    borderRadius: semantic.card.radius,
    borderWidth: semantic.input.borderWidth,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipIcon: {
    width: 40,
    height: 40,
    borderRadius: semantic.card.radiusCompact,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipBody: {
    flex: 1,
    gap: semantic.card.gapTiny,
  },
  chipLabel: {
    fontSize: semantic.card.bodySize,
    fontWeight: '700',
  },
  chipPrompt: {
    fontSize: semantic.card.captionSize,
    lineHeight: semantic.card.captionSize + 4,
  },
  skipCta: {
    alignSelf: 'center',
    paddingVertical: space['3'],
    marginTop: semantic.section.gap,
  },
  skipText: {
    fontSize: semantic.button.fontSize,
    fontWeight: '600',
  },
});
