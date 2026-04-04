import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useStartConversation } from '@/features/chat/application/useStartConversation';
import { ONBOARDING_ROUTE } from '@/features/auth/routes';
import { useDailyArt } from '@/features/daily-art/application/useDailyArt';
import { DailyArtCard } from '@/features/daily-art/ui/DailyArtCard';
import { useRuntimeSettings } from '@/features/settings/application/useRuntimeSettings';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { BrandMark } from '@/shared/ui/BrandMark';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

/** Renders the home screen with branding, runtime settings summary, and actions to start new conversations. */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { isCreating, error, setError, startConversation } = useStartConversation();
  const [menuStatus, setMenuStatus] = useState<string | null>(null);
  const { locale, museumMode } = useRuntimeSettings();
  const { artwork, isLoading: isDailyArtLoading, isSaved, dismissed, save, skip } = useDailyArt();

  const handleStartConversation = async (intent: 'default' | 'camera' | 'audio' = 'default') => {
    await startConversation({ intent });
    setMenuStatus(
      intent === 'camera'
        ? t('home.messages.lens_opened')
        : intent === 'audio'
          ? t('home.messages.audio_opened')
          : t('home.messages.conversation_opened'),
    );
  };

  return (
    <LiquidScreen background={pickMuseumBackground(0)}>
      <ScrollView
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.menuRow}>
          <FloatingContextMenu
            actions={[
              {
                id: 'discover',
                icon: 'sparkles-outline',
                label: t('home.menu.discover'),
                onPress: () => {
                  setMenuStatus(t('home.messages.opening_discover'));
                  router.push('/(stack)/discover');
                },
              },
              {
                id: 'lens',
                icon: 'camera-outline',
                label: t('home.menu.lens'),
                onPress: () => {
                  setMenuStatus(t('home.messages.opening_lens'));
                  void handleStartConversation('camera');
                },
              },
              {
                id: 'audio',
                icon: 'musical-notes-outline',
                label: t('home.menu.audio'),
                onPress: () => {
                  setMenuStatus(t('home.messages.opening_audio'));
                  void handleStartConversation('audio');
                },
              },
            ]}
          />
        </View>

        {menuStatus ? (
          <Text style={[styles.menuStatus, { color: theme.success }]}>{menuStatus}</Text>
        ) : null}

        <GlassCard style={styles.heroCard} intensity={62}>
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
          onPress={() => void handleStartConversation('default')}
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

        <View style={styles.secondaryRow}>
          <Pressable
            style={[
              styles.secondaryButton,
              { borderColor: theme.inputBorder, backgroundColor: theme.surface },
            ]}
            onPress={() => {
              router.push(ONBOARDING_ROUTE);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.home.onboarding')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
              {t('home.onboarding')}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.secondaryButton,
              { borderColor: theme.inputBorder, backgroundColor: theme.surface },
            ]}
            onPress={() => {
              router.push('/(stack)/settings');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.home.settings')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
              {t('home.settings')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingBottom: 110,
    justifyContent: 'center',
    gap: 16,
  },
  menuRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  menuStatus: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  heroCard: {
    padding: 20,
    gap: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  settingsNote: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 6,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
