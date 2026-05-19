import { Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Controller } from 'react-hook-form';
import type { Control } from 'react-hook-form';

import { FormInput } from '@/shared/ui/FormInput';
import { LiquidButton } from '@/shared/ui/LiquidButton';
import { useTheme } from '@/shared/ui/ThemeContext';

import { authStyles as styles } from './authStyles';
import type { AuthFormValues } from './authFormSchema';

interface LoginFormProps {
  control: Control<AuthFormValues>;
  isLoading: boolean;
  isSocialLoading: boolean;
  onForgotPassword: () => void;
  onSubmit: () => void;
}

/**
 * Email + password login form with forgot-password link, submit button,
 * and legal notice footer. Subscribes to its two fields locally via
 * `<Controller>` so the parent `AuthScreen` never re-renders on keystrokes
 * (TD-RHF-01). Inline field errors surface from the Zod resolver via
 * `fieldState.error` and bubble up to the `FormInput.error` prop.
 */
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
      <Controller
        control={control}
        name="email"
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
          <FormInput
            icon="mail-outline"
            placeholder={t('auth.email')}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            variant="email"
            testID="email-input"
            accessibilityLabel={t('a11y.auth.email_input')}
            error={error?.message}
            errorTestID="auth-email-error"
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
          <FormInput
            icon="lock-closed-outline"
            placeholder={t('auth.password')}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            variant="password"
            testID="password-input"
            accessibilityLabel={t('a11y.auth.password_input')}
            error={error?.message}
            errorTestID="auth-password-error"
          />
        )}
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
