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

import { useAuth } from '@/features/auth/application/AuthContext';
import { useOnboarding } from '@/features/onboarding/application/useOnboarding';
import { CameraIntentSlide } from '@/features/onboarding/ui/CameraIntentSlide';
import { GreetingSlide } from '@/features/onboarding/ui/GreetingSlide';
import { MuseumModeSlide } from '@/features/onboarding/ui/MuseumModeSlide';
import { StepIndicator } from '@/features/onboarding/ui/StepIndicator';
import { WalkIntentSlide } from '@/features/onboarding/ui/WalkIntentSlide';
import { useUserProfileStore } from '@/features/settings/infrastructure/userProfileStore';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDE_COUNT = 4;

type SlideKey = 'greeting' | 'museumMode' | 'cameraIntent' | 'walkIntent';

/** Renders the Onboarding v2 Spec B carousel: Greeting → MuseumMode → CameraIntent → WalkIntent. */
export default function OnboardingScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<SlideKey>>(null);
  const setHasSeenOnboarding = useUserProfileStore((s) => s.setHasSeenOnboarding);
  const { markOnboardingComplete } = useAuth();
  const { currentStep, goToStep, next, isLast } = useOnboarding(SLIDE_COUNT);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) {
        goToStep(first.index);
      }
    },
    [goToStep],
  );

  // eslint-disable-next-line react-hooks/refs -- stable config ref pattern
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleComplete = useCallback(async () => {
    try {
      await markOnboardingComplete();
    } catch (err) {
      console.warn('[onboarding] markOnboardingComplete failed', err);
    }
    setHasSeenOnboarding(true);
    router.replace('/(tabs)/home');
  }, [markOnboardingComplete, setHasSeenOnboarding]);

  const handleSkip = useCallback(async () => {
    await handleComplete();
  }, [handleComplete]);

  const handleNext = useCallback(() => {
    if (isLast) {
      void handleComplete();
      return;
    }
    next();
    flatListRef.current?.scrollToIndex({ index: currentStep + 1, animated: true });
  }, [isLast, next, currentStep, handleComplete]);

  const renderSlide = useCallback(({ item }: { item: SlideKey }) => {
    switch (item) {
      case 'greeting':
        return <GreetingSlide />;
      case 'museumMode':
        return <MuseumModeSlide />;
      case 'cameraIntent':
        return <CameraIntentSlide />;
      case 'walkIntent':
        return <WalkIntentSlide />;
    }
  }, []);

  const slides: SlideKey[] = ['greeting', 'museumMode', 'cameraIntent', 'walkIntent'];

  return (
    <LiquidScreen
      background={pickMuseumBackground(3)}
      contentStyle={[styles.screen, { paddingTop: insets.top + semantic.screen.padding }]}
    >
      <Pressable
        onPress={() => {
          void handleSkip();
        }}
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
        keyExtractor={(key) => key}
        renderItem={renderSlide}
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

      <StepIndicator totalSteps={SLIDE_COUNT} currentStep={currentStep} />

      <View style={styles.footer}>
        <Pressable
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          onPress={handleNext}
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
    paddingHorizontal: semantic.card.paddingLarge,
    paddingBottom: semantic.screen.padding,
  },
  skipButton: {
    alignSelf: 'flex-end',
    paddingVertical: semantic.card.gapSmall,
    paddingHorizontal: semantic.card.paddingCompact,
  },
  skipText: {
    fontWeight: '600',
    fontSize: semantic.button.fontSize,
  },
  carousel: {
    flex: 1,
  },
  carouselContent: {
    alignItems: 'center',
  },
  footer: {
    paddingTop: semantic.card.gapSmall,
    gap: semantic.screen.gapSmall,
  },
  primaryButton: {
    borderRadius: semantic.button.radius,
    alignItems: 'center',
    paddingVertical: semantic.button.paddingYCompact,
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.button.fontSizeLarge,
  },
});
