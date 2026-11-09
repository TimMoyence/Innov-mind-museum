import { Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Control } from 'react-hook-form';

import { LiquidButton } from '@/shared/ui/LiquidButton';
import { useTheme } from '@/shared/ui/ThemeContext';

import { AuthField } from './AuthField';
import { authStyles as styles } from './authStyles';
import type { AuthFormValues } from './authFormSchema';

interface LoginFormProps {
  control: Control<AuthFormValues>;
  isLoading: boolean;
  isSocialLoading: boolean;
  onForgotPassword: () => void;
  onSubmit: () => void;
}

export function LoginForm({
  control,
  isLoading,
  isSocialLoading,
  onForgotPassword,
  onSubmit,
}: LoginFormProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const disabled = isLoading || isSocialLoading;

  return (
    <>
      <AuthField
        control={control}
        name="email"
        icon="mail-outline"
        placeholder={t('auth.email')}
        variant="email"
        testID="email-input"
        accessibilityLabel={t('a11y.auth.email_input')}
        errorTestID="auth-email-error"
      />

      <AuthField
        control={control}
        name="password"
        icon="lock-closed-outline"
        placeholder={t('auth.password')}
        variant="password"
        testID="password-input"
        accessibilityLabel={t('a11y.auth.password_input')}
        errorTestID="auth-password-error"
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

      <LiquidButton
        label={t('auth.log_in')}
        onPress={onSubmit}
        loading={isLoading}
        disabled={disabled}
        accessibilityLabel={t('a11y.auth.login_button')}
        testID="auth-submit"
        variant="primary"
        size="md"
      />
    </>
  );
}
