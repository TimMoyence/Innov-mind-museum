import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';

import {
  GuideLevel,
  loadRuntimeSettings,
  saveDefaultLocale,
  saveDefaultMuseumMode,
  saveGuideLevel,
} from '@/features/settings/runtimeSettings';
import { getErrorMessage } from '@/shared/lib/errors';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { liquidColors, pickMuseumBackground } from '@/shared/ui/liquidTheme';

const GUIDE_LEVELS: GuideLevel[] = ['beginner', 'intermediate', 'expert'];

export default function PreferencesScreen() {
  const [locale, setLocale] = useState('en-US');
  const [museumMode, setMuseumMode] = useState(true);
  const [guideLevel, setGuideLevel] = useState<GuideLevel>('beginner');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    loadRuntimeSettings()
      .then((settings) => {
        setLocale(settings.defaultLocale);
        setMuseumMode(settings.defaultMuseumMode);
        setGuideLevel(settings.guideLevel);
      })
      .catch((error) => {
        setStatus(`Load failed: ${getErrorMessage(error)}`);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const onSave = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setStatus(null);

    try {
      await Promise.all([
        saveDefaultLocale(locale),
        saveDefaultMuseumMode(museumMode),
        saveGuideLevel(guideLevel),
      ]);
      setStatus('Preferences saved');
    } catch (error) {
      setStatus(`Save failed: ${getErrorMessage(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <LiquidScreen background={pickMuseumBackground(1)} contentStyle={styles.screen}>
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          actions={[
            {
              id: 'guided',
              icon: 'walk-outline',
              label: 'Guided Mode',
              onPress: () => router.push('/(stack)/guided-museum-mode'),
            },
            {
              id: 'privacy',
              icon: 'shield-checkmark-outline',
              label: 'Privacy',
              onPress: () => router.push('/(stack)/privacy'),
            },
            {
              id: 'back',
              icon: 'arrow-back-outline',
              label: 'Settings',
              onPress: () => router.push('/(stack)/settings'),
            },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.card} intensity={60}>
          <Text style={styles.title}>Preferences</Text>
          <Text style={styles.subtitle}>
            Control language, guided museum mode, and explanation depth for art conversations.
          </Text>

          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={liquidColors.primary} />
              <Text style={styles.hint}>Loading current preferences...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Language (locale)</Text>
              <Text style={styles.hint}>
                Used for AI response language and timestamp formatting in the chat.
              </Text>
              <TextInput
                value={locale}
                onChangeText={setLocale}
                placeholder='en-US'
                autoCapitalize='none'
                style={styles.input}
                placeholderTextColor='#64748B'
              />

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.label}>Guided Museum Mode</Text>
                  <Text style={styles.hint}>
                    Adds next-step recommendations and museum navigation cues.
                  </Text>
                </View>
                <Switch value={museumMode} onValueChange={setMuseumMode} />
              </View>

              <Text style={styles.label}>AI Guide Level</Text>
              <Text style={styles.hint}>
                Beginner keeps explanations simple. Expert uses art-history vocabulary.
              </Text>
              <View style={styles.levelRow}>
                {GUIDE_LEVELS.map((level) => (
                  <Pressable
                    key={level}
                    style={[
                      styles.levelButton,
                      guideLevel === level && styles.levelButtonActive,
                    ]}
                    onPress={() => setGuideLevel(level)}
                  >
                    <Text
                      style={[
                        styles.levelButtonText,
                        guideLevel === level && styles.levelButtonTextActive,
                      ]}
                    >
                      {level}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {status ? <Text style={styles.status}>{status}</Text> : null}

          <Pressable style={styles.primaryButton} onPress={() => void onSave()} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator color='#FFFFFF' />
            ) : (
              <Text style={styles.primaryButtonText}>Save Preferences</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.push('/(stack)/guided-museum-mode')}
          >
            <Text style={styles.secondaryButtonText}>Learn About Guided Museum Mode</Text>
          </Pressable>
        </GlassCard>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 16,
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  scrollContent: {
    paddingBottom: 18,
  },
  card: {
    padding: 18,
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: liquidColors.textPrimary,
  },
  subtitle: {
    color: liquidColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  label: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  hint: {
    color: liquidColors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.44)',
    backgroundColor: 'rgba(255,255,255,0.72)',
    padding: 12,
    color: liquidColors.textPrimary,
  },
  switchRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  switchTextWrap: {
    flex: 1,
    gap: 4,
  },
  levelRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  levelButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.44)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  levelButtonActive: {
    backgroundColor: liquidColors.primary,
    borderColor: liquidColors.primary,
  },
  levelButtonText: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  levelButtonTextActive: {
    color: '#FFFFFF',
  },
  status: {
    color: '#166534',
    fontWeight: '700',
    fontSize: 12,
    marginTop: 2,
  },
  primaryButton: {
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: liquidColors.primary,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    backgroundColor: 'rgba(255,255,255,0.68)',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  secondaryButtonText: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
});
