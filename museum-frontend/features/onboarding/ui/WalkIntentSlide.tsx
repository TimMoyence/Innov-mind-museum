import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, semantic, space } from '@/shared/ui/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Slide 4 of onboarding v2 Spec B: walk intent — guided museum walks. */
export const WalkIntentSlide = () => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      style={[styles.slide, { width: SCREEN_WIDTH - 36 }]}
      accessibilityRole="none"
    >
      <View style={[styles.iconWrap, { backgroundColor: theme.primaryTint }]}>
        <Ionicons name="walk-outline" size={48} color={theme.primary} />
      </View>

      <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
        {t('onboarding.v2.walkIntent.title')}
      </Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        {t('onboarding.v2.walkIntent.description')}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  slide: {
    paddingHorizontal: semantic.card.paddingLarge,
    justifyContent: 'center',
    alignItems: 'center',
    gap: space['4'],
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space['2'],
  },
  title: {
    fontSize: semantic.section.titleSizeLarge,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: space['5'],
  },
});
