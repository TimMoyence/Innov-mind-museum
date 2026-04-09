import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space } from '@/shared/ui/tokens.generated';

interface SettingsSecurityCardProps {
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  biometricLabel: string;
  isBiometricChecking: boolean;
  onToggleBiometric: (value: boolean) => void;
}

/** Security card: biometric toggle + change password. */
export const SettingsSecurityCard = ({
  biometricAvailable,
  biometricEnabled,
  biometricLabel,
  isBiometricChecking,
  onToggleBiometric,
}: SettingsSecurityCardProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <GlassCard style={styles.card} intensity={56}>
      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('settings.security')}</Text>
      <View style={styles.biometricRow}>
        <View style={styles.biometricInfo}>
          <Text style={[styles.biometricLabel, { color: theme.textPrimary }]}>
            {t('settings.biometric_lock')}
          </Text>
          {biometricAvailable ? (
            <Text style={[styles.biometricHint, { color: theme.textSecondary }]}>
              {biometricLabel}
            </Text>
          ) : (
            <Text style={[styles.biometricHint, { color: theme.textSecondary }]}>
              {t('biometric.not_available')}
            </Text>
          )}
        </View>
        <Switch
          value={biometricEnabled}
          onValueChange={onToggleBiometric}
          disabled={!biometricAvailable || isBiometricChecking}
          trackColor={{ false: theme.cardBorder, true: theme.primary }}
        />
      </View>
      <Pressable
        style={[
          styles.secondaryButton,
          { borderColor: theme.cardBorder, backgroundColor: theme.surface },
        ]}
        onPress={() => {
          router.push('/(stack)/change-password');
        }}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.settings.change_password')}
      >
        <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
          {t('settings.change_password')}
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.secondaryButton,
          { borderColor: theme.cardBorder, backgroundColor: theme.surface },
        ]}
        onPress={() => {
          router.push('/(stack)/change-email');
        }}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.settings.change_email')}
      >
        <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
          {t('settings.change_email')}
        </Text>
      </Pressable>
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
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  biometricInfo: {
    flex: 1,
    gap: space['0.5'],
  },
  biometricLabel: {
    fontWeight: '600',
    fontSize: semantic.card.bodySize,
  },
  biometricHint: {
    fontSize: semantic.card.captionSize,
  },
  secondaryButton: {
    borderRadius: semantic.button.radiusSmall,
    borderWidth: semantic.input.borderWidth,
    paddingVertical: semantic.button.paddingY,
    alignItems: 'center',
    paddingHorizontal: semantic.card.paddingCompact,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.button.fontSize,
  },
});
