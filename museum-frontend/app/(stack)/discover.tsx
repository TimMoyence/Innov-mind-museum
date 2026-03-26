import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { loadRuntimeSettings } from '@/features/settings/runtimeSettings';
import { getErrorMessage } from '@/shared/lib/errors';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

type ConversationIntent = 'default' | 'camera' | 'audio';

export default function DiscoverScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const startConversation = async (intent: ConversationIntent) => {
    if (isCreating) {
      return;
    }

    setIsCreating(true);
    setError(null);
    setActionStatus(
      intent === 'camera'
        ? t('discover.messages.opening_camera')
        : intent === 'audio'
          ? t('discover.messages.opening_voice')
          : t('discover.messages.opening_default'),
    );

    try {
      const settings = await loadRuntimeSettings();
      const response = await chatApi.createSession({
        locale: settings.defaultLocale,
        museumMode: settings.defaultMuseumMode,
      });

      const suffix = intent === 'default' ? '' : `?intent=${intent}`;
      router.push(`/(stack)/chat/${response.session.id}${suffix}`);
    } catch (createError) {
      setError(getErrorMessage(createError));
      setActionStatus(null);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <LiquidScreen background={pickMuseumBackground(0)} contentStyle={styles.screen}>
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          actions={[
            {
              id: 'lens',
              icon: 'camera-outline',
              label: t('discover.menu.lens'),
              onPress: () => void startConversation('camera'),
            },
            {
              id: 'audio',
              icon: 'mic-outline',
              label: t('discover.menu.audio'),
              onPress: () => void startConversation('audio'),
            },
            {
              id: 'saved',
              icon: 'grid-outline',
              label: t('discover.menu.dashboard'),
              onPress: () => router.push('/(tabs)/conversations'),
            },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.heroCard} intensity={62}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{t('discover.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('discover.subtitle')}
          </Text>
          {actionStatus ? <Text style={[styles.statusLine, { color: theme.primary }]}>{actionStatus}</Text> : null}
          {error ? <ErrorNotice message={error} onDismiss={() => setError(null)} /> : null}
        </GlassCard>

        <Pressable
          style={[styles.actionCard, styles.primaryActionCard]}
          onPress={() => void startConversation('camera')}
          disabled={isCreating}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.discover.photo_card')}
          accessibilityHint={t('a11y.discover.photo_card_hint')}
          accessibilityState={{ disabled: isCreating }}
        >
          <Text style={[styles.actionTitle, { color: theme.primaryContrast }]}>{t('discover.photo_title')}</Text>
          <Text style={styles.actionText}>
            {t('discover.photo_desc')}
          </Text>
          {isCreating ? <ActivityIndicator color={theme.primaryContrast} /> : <Text style={[styles.actionCta, { color: theme.primaryContrast }]}>{t('discover.open_lens')}</Text>}
        </Pressable>

        <GlassCard style={styles.actionGlassCard} intensity={56}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('discover.voice_title')}</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('discover.voice_desc')}
          </Text>
          <Pressable
            style={[styles.secondaryButton, { borderColor: theme.inputBorder, backgroundColor: theme.overlay }]}
            onPress={() => void startConversation('audio')}
            disabled={isCreating}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.discover.voice')}
            accessibilityState={{ disabled: isCreating }}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>{t('discover.start_audio')}</Text>
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.actionGlassCard} intensity={54}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('discover.continue_title')}</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('discover.continue_desc')}
          </Text>
          <Pressable
            style={[styles.secondaryButton, { borderColor: theme.inputBorder, backgroundColor: theme.overlay }]}
            onPress={() => router.push('/(tabs)/conversations')}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.discover.dashboard')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>{t('discover.open_dashboard')}</Text>
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.actionGlassCard} intensity={54}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('discover.guided_title')}</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {t('discover.guided_desc')}
          </Text>
          <Pressable
            style={[styles.secondaryButton, { borderColor: theme.inputBorder, backgroundColor: theme.overlay }]}
            onPress={() => router.push('/(stack)/guided-museum-mode')}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.discover.guided')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>{t('discover.open_guided')}</Text>
          </Pressable>
        </GlassCard>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 28,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 20,
  },
  heroCard: {
    padding: 18,
    gap: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  statusLine: {
    fontWeight: '700',
    fontSize: 12,
  },
  actionCard: {
    borderRadius: 20,
    padding: 18,
    gap: 8,
  },
  primaryActionCard: {
    backgroundColor: 'rgba(29,78,216,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.8)',
  },
  actionTitle: {
    fontWeight: '700',
    fontSize: 18,
  },
  actionText: {
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 20,
    fontSize: 13,
  },
  actionCta: {
    fontWeight: '700',
    fontSize: 13,
  },
  actionGlassCard: {
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  cardText: {
    fontSize: 13,
    lineHeight: 19,
  },
  secondaryButton: {
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
});
