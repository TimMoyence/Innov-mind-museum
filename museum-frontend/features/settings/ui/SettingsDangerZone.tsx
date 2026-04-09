import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space } from '@/shared/ui/tokens.generated';

interface SettingsDangerZoneProps {
  onDeleteAccount: () => void;
  isDeletingAccount: boolean;
}

/** Danger zone card with account deletion. */
export const SettingsDangerZone = ({
  onDeleteAccount,
  isDeletingAccount,
}: SettingsDangerZoneProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <GlassCard style={[styles.dangerCard, { borderColor: theme.errorBackground }]} intensity={52}>
      <Text style={[styles.dangerTitle, { color: theme.error }]}>{t('settings.danger_zone')}</Text>
      <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
        {t('settings.danger_zone_desc')}
      </Text>
      <Pressable
        style={[styles.deleteButton, { backgroundColor: theme.danger }]}
        onPress={onDeleteAccount}
        disabled={isDeletingAccount}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.settings.delete_account')}
        accessibilityHint={t('a11y.settings.delete_account_hint')}
        accessibilityState={{ disabled: isDeletingAccount }}
      >
        {isDeletingAccount ? (
          <ActivityIndicator color={theme.primaryContrast} />
        ) : (
          <Text style={[styles.deleteButtonText, { color: theme.primaryContrast }]}>
            {t('settings.delete_account')}
          </Text>
        )}
      </Pressable>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  dangerCard: {
    padding: semantic.card.padding,
    gap: semantic.form.gap,
  },
  dangerTitle: {
    fontWeight: '700',
    fontSize: semantic.card.titleSize,
  },
  cardBody: {
    lineHeight: space['5'],
    fontSize: semantic.form.labelSize,
  },
  deleteButton: {
    marginTop: space['0.5'],
    borderRadius: semantic.button.radiusSmall,
    alignItems: 'center',
    paddingVertical: semantic.button.paddingY,
  },
  deleteButtonText: {
    fontWeight: '700',
    fontSize: semantic.button.fontSize,
  },
});
