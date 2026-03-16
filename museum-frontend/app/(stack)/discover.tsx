import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { loadRuntimeSettings } from '@/features/settings/runtimeSettings';
import { getErrorMessage } from '@/shared/lib/errors';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { liquidColors, pickMuseumBackground } from '@/shared/ui/liquidTheme';

type ConversationIntent = 'default' | 'camera' | 'audio';

export default function DiscoverScreen() {
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
        ? 'Opening camera conversation...'
        : intent === 'audio'
          ? 'Opening voice conversation...'
          : 'Opening conversation...',
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
              label: 'Lens',
              onPress: () => void startConversation('camera'),
            },
            {
              id: 'audio',
              icon: 'mic-outline',
              label: 'Audio',
              onPress: () => void startConversation('audio'),
            },
            {
              id: 'saved',
              icon: 'grid-outline',
              label: 'Dashboard',
              onPress: () => router.push('/(tabs)/conversations'),
            },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.heroCard} intensity={62}>
          <Text style={styles.title}>Discover</Text>
          <Text style={styles.subtitle}>
            Explore artworks and monuments with the fastest entry points: photo analysis, voice question,
            or your recent sessions.
          </Text>
          {actionStatus ? <Text style={styles.statusLine}>{actionStatus}</Text> : null}
          {error ? <ErrorNotice message={error} onDismiss={() => setError(null)} /> : null}
        </GlassCard>

        <Pressable
          style={[styles.actionCard, styles.primaryActionCard]}
          onPress={() => void startConversation('camera')}
          disabled={isCreating}
        >
          <Text style={styles.actionTitle}>Take a Photo of an Artwork</Text>
          <Text style={styles.actionText}>
            Launch the camera directly and ask Musaium to analyze an artwork, monument, or cultural detail.
          </Text>
          {isCreating ? <ActivityIndicator color='#FFFFFF' /> : <Text style={styles.actionCta}>Open Lens</Text>}
        </Pressable>

        <GlassCard style={styles.actionGlassCard} intensity={56}>
          <Text style={styles.cardTitle}>Voice Question</Text>
          <Text style={styles.cardText}>
            Start an audio-first chat to record a spoken question while visiting a museum or monument.
          </Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void startConversation('audio')}
            disabled={isCreating}
          >
            <Text style={styles.secondaryButtonText}>Start Audio Conversation</Text>
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.actionGlassCard} intensity={54}>
          <Text style={styles.cardTitle}>Continue My Conversations</Text>
          <Text style={styles.cardText}>
            Open your dashboard to resume previous art sessions, saved chats, and recent interpretations.
          </Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.push('/(tabs)/conversations')}
          >
            <Text style={styles.secondaryButtonText}>Open Dashboard</Text>
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.actionGlassCard} intensity={54}>
          <Text style={styles.cardTitle}>Understand Guided Museum Mode</Text>
          <Text style={styles.cardText}>
            Learn how guided mode adds next-stop suggestions and richer context for museum visits.
          </Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.push('/(stack)/guided-museum-mode')}
          >
            <Text style={styles.secondaryButtonText}>Open Guided Mode Info</Text>
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
    color: liquidColors.textPrimary,
    fontSize: 30,
    fontWeight: '700',
  },
  subtitle: {
    color: liquidColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  statusLine: {
    color: '#1E3A8A',
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
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 18,
  },
  actionText: {
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 20,
    fontSize: 13,
  },
  actionCta: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  actionGlassCard: {
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  cardText: {
    color: liquidColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  secondaryButton: {
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    backgroundColor: 'rgba(255,255,255,0.70)',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
});
