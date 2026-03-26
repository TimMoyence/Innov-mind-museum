import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

interface BiometricLockScreenProps {
  biometricLabel: string;
  onUnlock: () => void;
  failed?: boolean;
}

export const BiometricLockScreen = ({
  biometricLabel,
  onUnlock,
  failed = false,
}: BiometricLockScreenProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.pageGradient[0] }]}>
      <Ionicons name="lock-closed-outline" size={64} color={theme.primary} />
      <Text style={[styles.title, { color: theme.textPrimary }]}>
        {t('biometric.lock_title')}
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        {t('biometric.lock_subtitle')}
      </Text>

      <Pressable
        style={[styles.button, { backgroundColor: theme.primary }]}
        onPress={onUnlock}
        accessibilityRole="button"
        accessibilityLabel={t('biometric.unlock')}
      >
        <Text style={[styles.buttonText, { color: theme.primaryContrast }]}>
          {failed
            ? t('biometric.retry')
            : `${t('biometric.unlock')} ${biometricLabel}`}
        </Text>
      </Pressable>

      {failed ? <Text style={[styles.failedText, { color: theme.error }]}>
          {t('biometric.failed')}
        </Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    marginTop: 24,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  buttonText: {
    fontWeight: '700',
    fontSize: 16,
  },
  failedText: {
    marginTop: 8,
    fontSize: 13,
  },
});
