import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { loadRuntimeSettings } from '@/features/settings/runtimeSettings';
import { getErrorMessage } from '@/shared/lib/errors';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { BrandMark } from '@/shared/ui/BrandMark';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { liquidColors, pickMuseumBackground } from '@/shared/ui/liquidTheme';

/** Renders the home screen with branding, runtime settings summary, and actions to start new conversations. */
export default function HomeScreen() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuStatus, setMenuStatus] = useState<string | null>(null);
  const [locale, setLocale] = useState('en-US');
  const [museumMode, setMuseumMode] = useState(true);

  useEffect(() => {
    loadRuntimeSettings()
      .then((settings) => {
        setLocale(settings.defaultLocale);
        setMuseumMode(settings.defaultMuseumMode);
      })
      .catch(() => {
        // keep defaults when settings are unavailable
      });
  }, []);

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
          ? 'Lens conversation opened'
          : intent === 'audio'
            ? 'Audio conversation opened'
            : 'Conversation opened',
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
              label: 'Discover',
              onPress: () => {
                setMenuStatus('Opening Discover');
                router.push('/(stack)/discover');
              },
            },
            {
              id: 'lens',
              icon: 'camera-outline',
              label: 'Lens',
              onPress: () => {
                setMenuStatus('Opening Lens');
                void startConversation('camera');
              },
            },
            {
              id: 'audio',
              icon: 'musical-notes-outline',
              label: 'Audio',
              onPress: () => {
                setMenuStatus('Opening Audio');
                void startConversation('audio');
              },
            },
          ]}
        />
      </View>

      {menuStatus ? <Text style={styles.menuStatus}>{menuStatus}</Text> : null}

      <GlassCard style={styles.heroCard} intensity={62}>
        <BrandMark variant='hero' />
        <Text style={styles.title}>Your museum companion</Text>
        <Text style={styles.subtitle}>
          Explore artworks, monuments, and heritage with a focused AI guide built for real visits.
        </Text>
        <Text style={styles.settingsNote}>
          Language: {locale} • Guided mode: {museumMode ? 'On' : 'Off'}
        </Text>
      </GlassCard>

      {error ? <ErrorNotice message={error} onDismiss={() => setError(null)} /> : null}

      <Pressable
        style={styles.primaryButton}
        onPress={() => void startConversation('default')}
        disabled={isCreating}
      >
        {isCreating ? (
          <ActivityIndicator color='#FFFFFF' />
        ) : (
          <Text style={styles.primaryButtonText}>Start Conversation</Text>
        )}
      </Pressable>

      <View style={styles.secondaryRow}>
        <Pressable style={styles.secondaryButton} onPress={() => router.push('/(stack)/onboarding')}>
          <Text style={styles.secondaryButtonText}>Onboarding</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push('/(stack)/settings')}>
          <Text style={styles.secondaryButtonText}>Settings</Text>
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
    color: liquidColors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: liquidColors.textSecondary,
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
    backgroundColor: liquidColors.primary,
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
    color: liquidColors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});
