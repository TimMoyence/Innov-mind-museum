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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { GuideLevel } from '@/features/settings/runtimeSettings';
import { saveDefaultMuseumMode, saveGuideLevel } from '@/features/settings/runtimeSettings';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { ContentPreferencesCard } from '@/features/settings/ui/ContentPreferencesCard';
import { getErrorMessage } from '@/shared/lib/errors';
import { LANGUAGE_OPTIONS } from '@/shared/config/supportedLocales';
import { useI18n } from '@/shared/i18n/I18nContext';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { semantic, space, fontSize } from '@/shared/ui/tokens';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

const GUIDE_LEVELS: GuideLevel[] = ['beginner', 'intermediate', 'expert'];

export default function PreferencesScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
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
    <LiquidScreen
      background={pickMuseumBackground(1)}
      contentStyle={[styles.screen, { paddingTop: insets.top + semantic.screen.gapSmall }]}
    >
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

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + semantic.screen.padding },
        ]}
        showsVerticalScrollIndicator={false}
      >
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

        <View style={styles.contentPreferencesWrap}>
          <ContentPreferencesCard />
        </View>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: semantic.card.paddingLarge,
    paddingTop: semantic.screen.paddingXL,
    paddingBottom: semantic.card.padding,
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: space['2.5'],
  },
  scrollContent: {
    paddingBottom: semantic.card.paddingLarge,
  },
  card: {
    padding: semantic.card.paddingLarge,
    gap: space['2.5'],
  },
  title: {
    fontSize: semantic.section.titleSizeHero,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: fontSize.sm,
    lineHeight: space['5'],
    marginBottom: space['0.5'],
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gapSmall,
    paddingVertical: semantic.card.gapSmall,
  },
  label: {
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
  hint: {
    fontSize: fontSize.xs,
    lineHeight: semantic.card.paddingLarge,
  },
  languageRow: {
    flexDirection: 'row',
    gap: semantic.card.gapSmall,
    flexWrap: 'wrap',
  },
  languageButton: {
    borderRadius: semantic.button.radiusSmall,
    borderWidth: semantic.input.borderWidth,
    paddingVertical: semantic.card.gapSmall,
    paddingHorizontal: semantic.card.paddingCompact,
  },
  languageButtonText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
  switchRow: {
    marginTop: semantic.section.gapTight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: semantic.card.gapSmall,
  },
  switchTextWrap: {
    flex: 1,
    gap: semantic.card.gapTiny,
  },
  levelRow: {
    flexDirection: 'row',
    gap: semantic.card.gapSmall,
    flexWrap: 'wrap',
  },
  levelButton: {
    borderRadius: semantic.button.radiusSmall,
    borderWidth: semantic.input.borderWidth,
    paddingVertical: semantic.card.gapSmall,
    paddingHorizontal: semantic.card.paddingCompact,
  },
  levelButtonText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
  status: {
    fontWeight: '700',
    fontSize: fontSize.xs,
    marginTop: space['0.5'],
  },
  primaryButton: {
    marginTop: semantic.section.gapTight,
    borderRadius: semantic.button.radiusSmall,
    alignItems: 'center',
    paddingVertical: semantic.button.paddingY,
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.button.fontSize,
  },
  secondaryButton: {
    borderRadius: semantic.button.radiusSmall,
    borderWidth: semantic.input.borderWidth,
    alignItems: 'center',
    paddingVertical: semantic.button.paddingY,
    paddingHorizontal: space['2.5'],
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
  contentPreferencesWrap: {
    marginTop: space['2.5'],
  },
});
