import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { loadRuntimeSettings } from '@/features/settings/runtimeSettings';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { getErrorMessage } from '@/shared/lib/errors';

export default function HomeScreen() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const startConversation = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const settings = await loadRuntimeSettings();
      const response = await chatApi.createSession({
        locale: settings.defaultLocale,
        museumMode: settings.defaultMuseumMode,
      });

      router.push(`/(stack)/chat/${response.session.id}`);
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MuseumIA Companion</Text>
      <Text style={styles.subtitle}>
        Discuss artworks with an AI guide, add an image, and get museum-ready storytelling.
      </Text>
      <Text style={styles.settingsNote}>
        Language: {locale} • Guided mode: {museumMode ? 'On' : 'Off'}
      </Text>

      {error ? <ErrorNotice message={error} onDismiss={() => setError(null)} /> : null}

      <Pressable style={styles.primaryButton} onPress={startConversation} disabled={isCreating}>
        {isCreating ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>Start Conversation</Text>
        )}
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={() => router.push('/(stack)/onboarding')}>
        <Text style={styles.secondaryButtonText}>Onboarding</Text>
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={() => router.push('/(stack)/settings')}>
        <Text style={styles.secondaryButtonText}>Settings</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 14,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#334155',
  },
  settingsNote: {
    fontSize: 13,
    color: '#0F766E',
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: '#0F766E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '500',
  },
});
