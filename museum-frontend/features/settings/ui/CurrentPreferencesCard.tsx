import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { GuideLevel } from '@/features/settings/runtimeSettings.pure';
import { LANGUAGE_OPTIONS } from '@/shared/config/supportedLocales';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, semantic, space } from '@/shared/ui/tokens';

interface CurrentPreferencesCardProps {
  locale: string;
  museumMode: boolean;
  guideLevel: GuideLevel;
  isLoading: boolean;
  onOpenPreferences: () => void;
}

export function CurrentPreferencesCard({
  locale,
  museumMode,
  guideLevel,
  isLoading,
  onOpenPreferences,
}: CurrentPreferencesCardProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <GlassCard style={styles.card} intensity={56}>
      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
        {t('settings.current_preferences')}
      </Text>
      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            {t('settings.loading_preferences')}
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.metaLine, { color: theme.textPrimary }]}>
            {t('settings.locale_label', {
              locale: LANGUAGE_OPTIONS.find((o) => o.code === locale)?.nativeLabel ?? locale,
            })}
          </Text>
          <Text style={[styles.metaLine, { color: theme.textPrimary }]}>
            {t('settings.museum_mode_label', {
              mode: museumMode ? t('common.on') : t('common.off'),
            })}
          </Text>
          <Text style={[styles.metaLine, { color: theme.textPrimary }]}>
            {t('settings.guide_level_label', { level: t(`guideLevel.${guideLevel}`) })}
          </Text>
        </>
      )}
      <Pressable
        style={[styles.primaryButton, { backgroundColor: theme.primary }]}
        onPress={onOpenPreferences}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.settings.preferences')}
      >
        <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
          {t('settings.open_preferences')}
        </Text>
      </Pressable>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: semantic.card.padding,
    gap: space['2.5'],
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: fontSize['lg-'],
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gapSmall,
  },
  loadingText: {
    fontSize: semantic.form.labelSize,
  },
  metaLine: {
    fontWeight: '600',
    fontSize: semantic.form.labelSize,
  },
  primaryButton: {
    marginTop: space['0.5'],
    borderRadius: semantic.button.radiusSmall,
    alignItems: 'center',
    paddingVertical: semantic.button.paddingY,
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.button.fontSize,
  },
});
