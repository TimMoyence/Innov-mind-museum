import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useMemoryPreference } from '@/features/settings/application/useMemoryPreference';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

/** Privacy card: AI memory (personalization) toggle. */
export const SettingsPrivacyCard = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { enabled, isLoading, toggle } = useMemoryPreference();

  return (
    <GlassCard style={styles.card} intensity={56}>
      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
        {t('settings.privacy_rgpd')}
      </Text>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={[styles.label, { color: theme.textPrimary }]}>
            {t('settings.ai_memory')}
          </Text>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            {t('settings.ai_memory_hint')}
          </Text>
        </View>
        {isLoading ? (
          <ActivityIndicator color={theme.primary} />
        ) : (
          <Switch
            value={enabled}
            onValueChange={(v) => void toggle(v)}
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
