import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space } from '@/shared/ui/tokens.generated';

type ThemeMode = 'system' | 'light' | 'dark';

const THEME_OPTION_KEYS: { value: ThemeMode; key: string }[] = [
  { value: 'system', key: 'settings.theme_system' },
  { value: 'light', key: 'settings.theme_light' },
  { value: 'dark', key: 'settings.theme_dark' },
];

interface SettingsThemeCardProps {
  mode: ThemeMode;
  onSetMode: (mode: ThemeMode) => void;
}

/** Theme mode selector card (system/light/dark). */
export const SettingsThemeCard = ({ mode, onSetMode }: SettingsThemeCardProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <GlassCard style={styles.card} intensity={56}>
      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
        {t('settings.appearance')}
      </Text>
      <View style={styles.themeRow}>
        {THEME_OPTION_KEYS.map((option) => (
          <Pressable
            key={option.value}
            style={[
              styles.themeButton,
              {
                borderColor: theme.cardBorder,
                backgroundColor: theme.surface,
              },
              mode === option.value && {
                borderColor: theme.primary,
                backgroundColor: theme.glassBackground,
              },
            ]}
            onPress={() => {
              onSetMode(option.value);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.settings.theme_button', { theme: option.key })}
            accessibilityState={{ selected: mode === option.value }}
          >
            <Text
              style={[
                styles.themeButtonText,
                { color: theme.textSecondary },
                // eslint-disable-next-line react-native/no-inline-styles -- conditional bold
                mode === option.value && { color: theme.primary, fontWeight: '700' },
              ]}
            >
              {t(option.key as 'settings.theme_system')}
            </Text>
          </Pressable>
        ))}
      </View>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: semantic.card.padding,
    gap: semantic.form.gap,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: semantic.card.titleSize,
  },
  themeRow: {
    flexDirection: 'row',
    gap: semantic.card.gapSmall,
  },
  themeButton: {
    flex: 1,
    borderRadius: semantic.card.radiusCompact,
    borderWidth: semantic.input.borderWidth,
    paddingVertical: space['2.5'],
    alignItems: 'center',
  },
  themeButtonText: {
    fontSize: semantic.card.bodySize,
    fontWeight: '600',
  },
});
