import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import type { GuideLevel } from '@/features/settings/runtimeSettings';
import { saveDefaultMuseumMode, saveGuideLevel } from '@/features/settings/runtimeSettings';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { getErrorMessage } from '@/shared/lib/errors';
import { LANGUAGE_OPTIONS } from '@/shared/config/supportedLocales';
import { useI18n } from '@/shared/i18n/I18nContext';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

const GUIDE_LEVELS: GuideLevel[] = ['beginner', 'intermediate', 'expert'];

export default function PreferencesScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { language, setLanguage } = useI18n();
  const storeMuseumMode = useRuntimeSettingsStore((s) => s.defaultMuseumMode);
  const storeGuideLevel = useRuntimeSettingsStore((s) => s.guideLevel);
  const storeHydrated = useRuntimeSettingsStore((s) => s._hydrated);
  const [museumMode, setMuseumMode] = useState(storeMuseumMode);
  const [guideLevel, setGuideLevel] = useState<GuideLevel>(storeGuideLevel);
  const isLoading = !storeHydrated;
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (storeHydrated) {
      setMuseumMode(storeMuseumMode);
      setGuideLevel(storeGuideLevel);
    }
  }, [storeHydrated, storeMuseumMode, storeGuideLevel]);

  const storeSetMuseumMode = useRuntimeSettingsStore((s) => s.setDefaultMuseumMode);
  const storeSetGuideLevel = useRuntimeSettingsStore((s) => s.setGuideLevel);

  const onSave = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setStatus(null);

    try {
      await Promise.all([saveDefaultMuseumMode(museumMode), saveGuideLevel(guideLevel)]);
      storeSetMuseumMode(museumMode);
      storeSetGuideLevel(guideLevel);
      setStatus(t('preferences.saved'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setStatus(t('preferences.save_failed', { error: getErrorMessage(error) }));
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
              label: t('preferences.menu.guided'),
              onPress: () => {
                router.push('/(stack)/guided-museum-mode');
              },
            },
            {
              id: 'privacy',
              icon: 'shield-checkmark-outline',
              label: t('preferences.menu.privacy'),
              onPress: () => {
                router.push('/(stack)/privacy');
              },
            },
            {
              id: 'back',
              icon: 'arrow-back-outline',
              label: t('preferences.menu.settings'),
              onPress: () => {
                router.push('/(stack)/settings');
              },
            },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.card} intensity={60}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{t('preferences.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('preferences.subtitle')}
          </Text>

          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                {t('preferences.loading')}
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.label, { color: theme.textPrimary }]}>
                {t('preferences.language_label')}
              </Text>
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                {t('preferences.language_hint')}
              </Text>
              <View style={styles.languageRow}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.code}
                    style={[
                      styles.languageButton,
                      { borderColor: theme.cardBorder, backgroundColor: theme.assistantBubble },
                      language === option.code && {
                        backgroundColor: theme.primary,
                        borderColor: theme.primary,
                      },
                    ]}
                    onPress={() => {
                      setLanguage(option.code);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('a11y.preferences.language_button', {
                      language: option.nativeLabel,
                    })}
                    accessibilityState={{ selected: language === option.code }}
                  >
                    <Text
                      style={[
                        styles.languageButtonText,
                        { color: theme.textPrimary },
                        language === option.code && { color: theme.primaryContrast },
                      ]}
                    >
                      {option.nativeLabel}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={[styles.label, { color: theme.textPrimary }]}>
                    {t('preferences.museum_mode_label')}
                  </Text>
                  <Text style={[styles.hint, { color: theme.textSecondary }]}>
                    {t('preferences.museum_mode_hint')}
                  </Text>
                </View>
                <Switch
                  value={museumMode}
                  onValueChange={setMuseumMode}
                  accessibilityRole="switch"
                  accessibilityLabel={t('a11y.preferences.museum_mode_switch')}
                  accessibilityState={{ checked: museumMode }}
                />
              </View>

              <Text style={[styles.label, { color: theme.textPrimary }]}>
                {t('preferences.guide_level_label')}
              </Text>
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                {t('preferences.guide_level_hint')}
              </Text>
              <View style={styles.levelRow}>
                {GUIDE_LEVELS.map((level) => (
                  <Pressable
                    key={level}
                    style={[
                      styles.levelButton,
                      { borderColor: theme.cardBorder, backgroundColor: theme.assistantBubble },
                      guideLevel === level && {
                        backgroundColor: theme.primary,
                        borderColor: theme.primary,
                      },
                    ]}
                    onPress={() => {
                      setGuideLevel(level);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('a11y.preferences.guide_level_button', { level })}
                    accessibilityState={{ selected: guideLevel === level }}
                  >
                    <Text
                      style={[
                        styles.levelButtonText,
                        { color: theme.textPrimary },
                        guideLevel === level && { color: theme.primaryContrast },
                      ]}
                    >
                      {level}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {status ? <Text style={[styles.status, { color: theme.success }]}>{status}</Text> : null}

          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={() => void onSave()}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.preferences.save')}
            accessibilityState={{ disabled: isSaving }}
          >
            {isSaving ? (
              <ActivityIndicator color={theme.primaryContrast} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
                {t('preferences.save_button')}
              </Text>
            )}
          </Pressable>

          <Pressable
            style={[
              styles.secondaryButton,
              { borderColor: theme.inputBorder, backgroundColor: theme.cardBackground },
            ]}
            onPress={() => {
              router.push('/(stack)/guided-museum-mode');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.preferences.learn_guided')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
              {t('preferences.learn_guided')}
            </Text>
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
  },
  subtitle: {
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
    fontWeight: '700',
    fontSize: 14,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
  },
  languageRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  languageButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  languageButtonText: {
    fontWeight: '700',
    fontSize: 13,
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
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  levelButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
  status: {
    fontWeight: '700',
    fontSize: 12,
    marginTop: 2,
  },
  primaryButton: {
    marginTop: 6,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
});
