import { ActivityIndicator, Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { FormInput } from '@/shared/ui/FormInput';
import { useTheme } from '@/shared/ui/ThemeContext';

import { authStyles as styles } from './authStyles';

interface LoginFormProps {
  email: string;
  password: string;
  isLoading: boolean;
  isSocialLoading: boolean;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onForgotPassword: () => void;
  onSubmit: () => void;
}

/**
 * Email + password login form with forgot-password link, submit button,
 * and legal notice footer. Stateless — all state and handlers are passed
 * in from the parent `AuthScreen` orchestrator.
 */
export function LoginForm({
  email,
  password,
  isLoading,
  isSocialLoading,
  onChangeEmail,
  onChangePassword,
  onForgotPassword,
  onSubmit,
}: LoginFormProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const disabled = isLoading || isSocialLoading;

  return (
    <>
      <FormInput
        icon="mail-outline"
        placeholder={t('auth.email')}
        value={email}
        onChangeText={onChangeEmail}
        variant="email"
        testID="email-input"
        accessibilityLabel={t('a11y.auth.email_input')}
      />

      <FormInput
        icon="lock-closed-outline"
        placeholder={t('auth.password')}
        value={password}
        onChangeText={onChangePassword}
        variant="password"
        testID="password-input"
        accessibilityLabel={t('a11y.auth.password_input')}
      />

      <Pressable
        style={styles.forgotPasswordButton}
        onPress={onForgotPassword}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.auth.forgot_password')}
        accessibilityHint={t('a11y.auth.forgot_password_hint')}
      >
        <Text style={[styles.forgotPasswordText, { color: theme.primary }]}>
          {t('auth.forgot_password')}
        </Text>
      </Pressable>

      <Pressable
        style={[
          styles.submitButton,
          { backgroundColor: theme.primary, shadowColor: theme.shadowColor },
          disabled && styles.submitButtonDisabled,
        ]}
        onPress={onSubmit}
        disabled={disabled}
        testID="auth-submit"
        accessibilityRole="button"
        accessibilityLabel={t('a11y.auth.login_button')}
        accessibilityState={{ disabled }}
      >
        {disabled ? (
          <ActivityIndicator color={theme.primaryContrast} />
        ) : (
          <Text style={[styles.submitButtonText, { color: theme.primaryContrast }]}>
            {t('auth.log_in')}
          </Text>
        )}
      </Pressable>
    </>
  );
}
