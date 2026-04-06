import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAudioDescriptionMode } from '@/features/settings/application/useAudioDescriptionMode';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

/** Accessibility card: audio description mode toggle. */
export const SettingsAccessibilityCard = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { enabled, isLoading, toggle } = useAudioDescriptionMode();

  return (
    <GlassCard style={styles.card} intensity={56}>
      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
        {t('settings.accessibility')}
      </Text>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={[styles.label, { color: theme.textPrimary }]}>
            {t('settings.audio_description')}
          </Text>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            {t('settings.audio_description_hint')}
          </Text>
        </View>
        {isLoading ? (
          <ActivityIndicator color={theme.primary} />
        ) : (
          <Switch
            value={enabled}
            onValueChange={() => void toggle()}
            trackColor={{ false: theme.cardBorder, true: theme.primary }}
          />
        )}
      </View>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 17,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontWeight: '600',
    fontSize: 14,
  },
  hint: {
    fontSize: 12,
  },
});
