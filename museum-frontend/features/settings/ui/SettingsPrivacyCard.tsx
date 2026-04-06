import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useMemoryPreference } from '@/features/settings/application/useMemoryPreference';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

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
