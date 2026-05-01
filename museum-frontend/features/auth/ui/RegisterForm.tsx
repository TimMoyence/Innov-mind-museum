import { useTranslation } from 'react-i18next';

import { FormInput } from '@/shared/ui/FormInput';
import { LiquidButton } from '@/shared/ui/LiquidButton';

import { GdprConsentCheckbox } from './GdprConsentCheckbox';

interface RegisterFormProps {
  email: string;
  password: string;
  firstname: string;
  lastname: string;
  gdprAccepted: boolean;
  isLoading: boolean;
  isSocialLoading: boolean;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onChangeFirstname: (value: string) => void;
  onChangeLastname: (value: string) => void;
  onToggleGdpr: () => void;
  onSubmit: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
}

/**
 * Registration form: first/last name, email, password, GDPR consent
 * checkbox (with inline terms/privacy links), and submit button.
 * Stateless — all state and handlers are passed in from the parent
 * `AuthScreen` orchestrator. The submit button stays disabled until
 * GDPR consent is granted.
 */
export function RegisterForm({
  email,
  password,
  firstname,
  lastname,
  gdprAccepted,
  isLoading,
  isSocialLoading,
  onChangeEmail,
  onChangePassword,
  onChangeFirstname,
  onChangeLastname,
  onToggleGdpr,
  onSubmit,
  onOpenTerms,
  onOpenPrivacy,
}: RegisterFormProps) {
  const { t } = useTranslation();

  const disabled = isLoading || isSocialLoading || !gdprAccepted;

  return (
    <>
      <FormInput
        icon="person-outline"
        placeholder={t('auth.first_name')}
        value={firstname}
        onChangeText={onChangeFirstname}
        accessibilityLabel={t('a11y.auth.firstname_input')}
      />
      <FormInput
        icon="person-outline"
        placeholder={t('auth.last_name')}
        value={lastname}
        onChangeText={onChangeLastname}
        accessibilityLabel={t('a11y.auth.lastname_input')}
      />

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
        variant="password-new"
        testID="password-input"
        accessibilityLabel={t('a11y.auth.password_input')}
      />

      <GdprConsentCheckbox
        accepted={gdprAccepted}
        onToggle={onToggleGdpr}
        onOpenTerms={onOpenTerms}
        onOpenPrivacy={onOpenPrivacy}
      />

      <LiquidButton
        label={t('auth.sign_up')}
        onPress={onSubmit}
        loading={isLoading || isSocialLoading}
        disabled={disabled}
        accessibilityLabel={t('a11y.auth.register_button')}
        testID="auth-submit"
        variant="primary"
        size="md"
      />
    </>
  );
}
