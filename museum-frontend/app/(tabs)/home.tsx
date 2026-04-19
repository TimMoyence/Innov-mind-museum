import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useStartConversation } from '@/features/chat/application/useStartConversation';
import { useDailyArt } from '@/features/daily-art/application/useDailyArt';
import { DailyArtCard } from '@/features/daily-art/ui/DailyArtCard';
import { HeroSettingsButton } from '@/features/home/ui/HeroSettingsButton';
import { HomeIntentChips, type HomeIntent } from '@/features/home/ui/HomeIntentChips';
import { useRuntimeSettings } from '@/features/settings/application/useRuntimeSettings';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { BrandMark } from '@/shared/ui/BrandMark';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

const INTENT_MAP: Record<HomeIntent, 'audio' | 'camera' | 'walk'> = {
  vocal: 'audio',
  camera: 'camera',
  walk: 'walk',
};

/** Renders the home screen with branding, daily artwork, 3 intent chips, and a primary start-conversation CTA. */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { isCreating, error, setError, startConversation } = useStartConversation();
  const { locale, museumMode } = useRuntimeSettings();
  const { artwork, isLoading: isDailyArtLoading, isSaved, dismissed, save, skip } = useDailyArt();

  const handleIntentPress = (intent: HomeIntent): void => {
    void startConversation({ intent: INTENT_MAP[intent] });
  };

  const handleStartDefault = (): void => {
    void startConversation({ intent: 'default' });
  };

  return (
    <LiquidScreen background={pickMuseumBackground(0)}>
      <ScrollView
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <GlassCard style={styles.heroCard} intensity={62}>
          <HeroSettingsButton />
          <BrandMark variant="hero" />
          <Text style={[styles.title, { color: theme.textPrimary }]}>{t('home.hero_title')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('home.hero_subtitle')}
          </Text>
          <Text style={[styles.settingsNote, { color: theme.textTertiary }]}>
            {t('home.settings_note', {
              locale,
              mode: museumMode ? t('common.on') : t('common.off'),
            })}
          </Text>
        </GlassCard>

        {artwork && !dismissed && !isDailyArtLoading ? (
          <DailyArtCard
            artwork={artwork}
            isSaved={isSaved}
            onSave={() => void save()}
            onSkip={() => void skip()}
          />
        ) : null}

        <HomeIntentChips onPress={handleIntentPress} disabled={isCreating} />

        {error ? (
          <ErrorNotice
            message={error}
            onDismiss={() => {
              setError(null);
            }}
          />
        ) : null}

        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: theme.primary, shadowColor: theme.shadowColor },
          ]}
          onPress={handleStartDefault}
          disabled={isCreating}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.home.start_conversation')}
          accessibilityHint={t('a11y.home.start_conversation_hint')}
          accessibilityState={{ disabled: isCreating }}
        >
          {isCreating ? (
            <ActivityIndicator color={theme.primaryContrast} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
              {t('home.start_conversation')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    paddingHorizontal: space['5.5'],
    paddingBottom: semantic.media.homeBottomPad,
    justifyContent: 'center',
    gap: semantic.screen.gap,
  },
  heroCard: {
    padding: semantic.modal.padding,
    gap: semantic.form.gap,
  },
  title: {
    fontSize: space['8'],
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: semantic.section.subtitleSize,
    lineHeight: space['6'],
    textAlign: 'center',
  },
  settingsNote: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: semantic.section.gapTight,
    borderRadius: semantic.modal.radius,
    paddingVertical: semantic.button.paddingYCompact,
    alignItems: 'center',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  primaryButtonText: {
    fontSize: semantic.button.fontSizeLarge,
    fontWeight: '700',
  },
});
