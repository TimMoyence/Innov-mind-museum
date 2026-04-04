import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

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
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 17,
  },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  biometricInfo: {
    flex: 1,
    gap: 2,
  },
  biometricLabel: {
    fontWeight: '600',
    fontSize: 14,
  },
  biometricHint: {
    fontSize: 12,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
});
