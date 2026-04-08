import { useCallback, useRef, useState } from 'react';
import {
  Alert,
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

import { useAuth } from '@/features/auth/application/AuthContext';
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
      navPreviewTabs: [
        { icon: 'home-outline', label: t('tabs.home') },
        { icon: 'business-outline', label: t('tabs.museums') },
        { icon: 'grid-outline', label: t('tabs.dashboard') },
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
  const { markOnboardingComplete } = useAuth();
  const { currentStep, goToStep, next, isLast } = useOnboarding(slides.length);
  const [isCompleting, setIsCompleting] = useState(false);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        goToStep(viewableItems[0].index);
      }
    },
    [goToStep],
  );

  // eslint-disable-next-line react-hooks/refs -- stable config ref pattern
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const completeAndNavigate = useCallback(async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    try {
      await markOnboardingComplete();
      router.replace('/(tabs)/home');
    } catch {
      setIsCompleting(false);
      Alert.alert(t('common.error'), t('error.network'));
    }
  }, [isCompleting, markOnboardingComplete, t]);

  const handleNext = useCallback(async () => {
    if (isLast) {
      await completeAndNavigate();
      return;
    }
    next();
    flatListRef.current?.scrollToIndex({ index: currentStep + 1, animated: true });
  }, [isLast, next, currentStep, completeAndNavigate]);

  const handleSkip = useCallback(async () => {
    await completeAndNavigate();
  }, [completeAndNavigate]);

  return (
    <LiquidScreen
      background={pickMuseumBackground(3)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 16 }]}
    >
      <Pressable
        onPress={() => void handleSkip()}
        style={styles.skipButton}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.onboarding.skip')}
      >
        <Text style={[styles.skipText, { color: theme.placeholderText }]}>
          {t('onboarding.skip')}
        </Text>
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
        <Pressable
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          onPress={() => void handleNext()}
          accessibilityRole="button"
          accessibilityLabel={isLast ? t('a11y.onboarding.get_started') : t('a11y.onboarding.next')}
        >
          <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
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
    fontWeight: '700',
    fontSize: 15,
  },
});
