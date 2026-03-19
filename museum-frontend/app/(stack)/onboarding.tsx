import { useCallback, useRef } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOnboarding } from '@/features/onboarding/application/useOnboarding';
import { OnboardingSlide, type SlideData } from '@/features/onboarding/ui/OnboardingSlide';
import { StepIndicator } from '@/features/onboarding/ui/StepIndicator';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Renders the onboarding carousel with swipeable slides, step indicator, and completion flow. */
export default function OnboardingScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const slides: SlideData[] = [
    {
      icon: 'trail-sign-outline',
      title: t('onboarding.slide0.title'),
      subtitle: t('onboarding.slide0.subtitle'),
      bullets: [
        t('onboarding.slide0.tip1'),
        t('onboarding.slide0.tip2'),
        t('onboarding.slide0.tip3'),
        t('onboarding.slide0.tip4'),
      ],
    },
    {
      icon: 'bulb-outline',
      title: t('onboarding.slide1.title'),
      subtitle: t('onboarding.slide1.subtitle'),
      bullets: [
        t('onboarding.slide1.tip1'),
        t('onboarding.slide1.tip2'),
        t('onboarding.slide1.tip3'),
        t('onboarding.slide1.tip4'),
      ],
    },
    {
      icon: 'help-circle-outline',
      title: t('onboarding.slide2.title'),
      subtitle: t('onboarding.slide2.subtitle'),
      bullets: [
        t('onboarding.slide2.tip1'),
        t('onboarding.slide2.tip2'),
        t('onboarding.slide2.tip3'),
        t('onboarding.slide2.tip4'),
      ],
    },
  ];
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<SlideData>>(null);
  const { currentStep, goToStep, next, isLast, completeOnboarding } = useOnboarding(slides.length);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        goToStep(viewableItems[0].index);
      }
    },
    [goToStep],
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleNext = useCallback(() => {
    if (isLast) {
      void completeOnboarding();
      router.replace('/(tabs)/home');
      return;
    }
    next();
    flatListRef.current?.scrollToIndex({ index: currentStep + 1, animated: true });
  }, [isLast, next, currentStep, completeOnboarding]);

  const handleSkip = useCallback(() => {
    void completeOnboarding();
    router.replace('/(tabs)/home');
  }, [completeOnboarding]);

  return (
    <LiquidScreen background={pickMuseumBackground(3)} contentStyle={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <Pressable onPress={handleSkip} style={styles.skipButton}>
        <Text style={[styles.skipText, { color: theme.textSecondary }]}>{t('onboarding.skip')}</Text>
      </Pressable>

      <FlatList
        ref={flatListRef}
        data={slides}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => <OnboardingSlide slide={item} />}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH - 36,
          offset: (SCREEN_WIDTH - 36) * index,
          index,
        })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        contentContainerStyle={styles.carouselContent}
        style={styles.carousel}
        snapToInterval={SCREEN_WIDTH - 36}
        decelerationRate="fast"
      />

      <StepIndicator totalSteps={slides.length} currentStep={currentStep} />

      <View style={styles.footer}>
        <Pressable style={[styles.primaryButton, { backgroundColor: theme.primary }]} onPress={handleNext}>
          <Text style={styles.primaryButtonText}>
            {isLast ? t('onboarding.get_started') : t('onboarding.next')}
          </Text>
        </Pressable>
      </View>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  skipButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 14,
  },
  carousel: {
    flex: 1,
  },
  carouselContent: {
    alignItems: 'center',
  },
  footer: {
    paddingTop: 8,
    gap: 12,
  },
  primaryButton: {
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
