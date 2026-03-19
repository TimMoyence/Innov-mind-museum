import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { loadRuntimeSettings } from '@/features/settings/runtimeSettings';
import { useRuntimeSettings } from '@/features/settings/application/useRuntimeSettings';
import { getErrorMessage } from '@/shared/lib/errors';
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
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuStatus, setMenuStatus] = useState<string | null>(null);
  const { locale, museumMode } = useRuntimeSettings();

  const startConversation = async (
    intent: 'default' | 'camera' | 'audio' = 'default',
  ) => {
    setIsCreating(true);
    setError(null);

    try {
      const settings = await loadRuntimeSettings();
      const response = await chatApi.createSession({
        locale: settings.defaultLocale,
        museumMode: settings.defaultMuseumMode,
      });

      const suffix = intent === 'default' ? '' : `?intent=${intent}`;
      router.push(`/(stack)/chat/${response.session.id}${suffix}`);
      setMenuStatus(
        intent === 'camera'
          ? t('home.messages.lens_opened')
          : intent === 'audio'
            ? t('home.messages.audio_opened')
            : t('home.messages.conversation_opened'),
      );
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <LiquidScreen background={pickMuseumBackground(0)} contentStyle={styles.screen}>
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
                void startConversation('camera');
              },
            },
            {
              id: 'audio',
              icon: 'musical-notes-outline',
              label: t('home.menu.audio'),
              onPress: () => {
                setMenuStatus(t('home.messages.opening_audio'));
                void startConversation('audio');
              },
            },
          ]}
        />
      </View>

      {menuStatus ? <Text style={styles.menuStatus}>{menuStatus}</Text> : null}

      <GlassCard style={styles.heroCard} intensity={62}>
        <BrandMark variant='hero' />
        <Text style={[styles.title, { color: theme.textPrimary }]}>{t('home.hero_title')}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t('home.hero_subtitle')}
        </Text>
        <Text style={styles.settingsNote}>
          {t('home.settings_note', { locale, mode: museumMode ? t('common.on') : t('common.off') })}
        </Text>
      </GlassCard>

      {error ? <ErrorNotice message={error} onDismiss={() => setError(null)} /> : null}

      <Pressable
        style={[styles.primaryButton, { backgroundColor: theme.primary }]}
        onPress={() => void startConversation('default')}
        disabled={isCreating}
      >
        {isCreating ? (
          <ActivityIndicator color='#FFFFFF' />
        ) : (
          <Text style={styles.primaryButtonText}>{t('home.start_conversation')}</Text>
        )}
      </Pressable>

      <View style={styles.secondaryRow}>
        <Pressable style={styles.secondaryButton} onPress={() => router.push('/(stack)/onboarding')}>
          <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>{t('home.onboarding')}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push('/(stack)/settings')}>
          <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>{t('home.settings')}</Text>
        </Pressable>
      </View>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 22,
    justifyContent: 'center',
    gap: 16,
  },
  menuRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  menuStatus: {
    textAlign: 'center',
    color: '#1E3A8A',
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
    color: '#1E3A8A',
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 6,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  primaryButtonText: {
    color: '#FFFFFF',
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
    borderColor: 'rgba(148,163,184,0.5)',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.64)',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
