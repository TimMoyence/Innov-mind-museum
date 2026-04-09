import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAudioDescriptionMode } from '@/features/settings/application/useAudioDescriptionMode';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space } from '@/shared/ui/tokens.generated';

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
    padding: semantic.card.padding,
    gap: semantic.form.gap,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: semantic.card.titleSize,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  info: {
    flex: 1,
    gap: space['0.5'],
  },
  label: {
    fontWeight: '600',
    fontSize: semantic.card.bodySize,
  },
  hint: {
    fontSize: semantic.card.captionSize,
  },
});
