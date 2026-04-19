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
import { useStartConversation } from '@/features/chat/application/useStartConversation';
import { useOnboarding } from '@/features/onboarding/application/useOnboarding';
import { ChatDemoSlide } from '@/features/onboarding/ui/ChatDemoSlide';
import {
  FirstPromptChipsSlide,
  type ChipDefinition,
} from '@/features/onboarding/ui/FirstPromptChipsSlide';
import { StepIndicator } from '@/features/onboarding/ui/StepIndicator';
import { ValuePropSlide } from '@/features/onboarding/ui/ValuePropSlide';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDE_COUNT = 3;

type SlideKey = 'demo' | 'value' | 'chips';

/** Renders the Onboarding v2 carousel: animated chat demo → value prop → first-prompt chips. */
export default function OnboardingScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<SlideKey>>(null);
  const { markOnboardingComplete } = useAuth();
  const { startConversation } = useStartConversation();
  const { currentStep, goToStep, next, isLast } = useOnboarding(SLIDE_COUNT);
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

  const completeOnboarding = useCallback(async () => {
    if (isCompleting) return false;
    setIsCompleting(true);
    try {
      await markOnboardingComplete();
      return true;
    } catch {
      setIsCompleting(false);
      Alert.alert(t('common.error'), t('error.network'));
      return false;
    }
  }, [isCompleting, markOnboardingComplete, t]);

  const handleSkip = useCallback(async () => {
    const ok = await completeOnboarding();
    if (ok) router.replace('/(tabs)/home');
  }, [completeOnboarding]);

  const handleExplore = useCallback(async () => {
    await handleSkip();
  }, [handleSkip]);

  const handleChip = useCallback(
    async ({ prompt }: { id: ChipDefinition['id']; prompt: string }) => {
      const ok = await completeOnboarding();
      if (!ok) return;
      await startConversation({ initialPrompt: prompt });
    },
    [completeOnboarding, startConversation],
  );

  const handleNext = useCallback(() => {
    if (isLast) return;
    next();
    flatListRef.current?.scrollToIndex({ index: currentStep + 1, animated: true });
  }, [isLast, next, currentStep]);

  const renderSlide = useCallback(
    ({ item }: { item: SlideKey }) => {
      switch (item) {
        case 'demo':
          return <ChatDemoSlide />;
        case 'value':
          return <ValuePropSlide />;
        case 'chips':
          return (
            <FirstPromptChipsSlide
              onChipPress={(args) => void handleChip(args)}
              onSkip={() => void handleExplore()}
              disabled={isCompleting}
            />
          );
      }
    },
    [handleChip, handleExplore, isCompleting],
  );

  const slides: SlideKey[] = ['demo', 'value', 'chips'];

  return (
    <LiquidScreen
      background={pickMuseumBackground(3)}
      contentStyle={[styles.screen, { paddingTop: insets.top + semantic.screen.padding }]}
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

      {!isLast ? (
        <View style={styles.footer}>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={handleNext}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.onboarding.next')}
          >
            <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
              {t('onboarding.next')}
            </Text>
          </Pressable>
        </View>
      ) : null}
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
