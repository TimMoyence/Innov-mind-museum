import { useTranslation } from 'react-i18next';

import { FormInput } from '@/shared/ui/FormInput';
import { LiquidButton } from '@/shared/ui/LiquidButton';

import { GdprConsentCheckbox } from './GdprConsentCheckbox';

interface RegisterFormProps {
  email: string;
  password: string;
  firstname: string;
  lastname: string;
  dateOfBirth: string;
  gdprAccepted: boolean;
  isLoading: boolean;
  isSocialLoading: boolean;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onChangeFirstname: (value: string) => void;
  onChangeLastname: (value: string) => void;
  onChangeDateOfBirth: (value: string) => void;
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
  dateOfBirth,
  gdprAccepted,
  isLoading,
  isSocialLoading,
  onChangeEmail,
  onChangePassword,
  onChangeFirstname,
  onChangeLastname,
  onChangeDateOfBirth,
  onToggleGdpr,
  onSubmit,
  onOpenTerms,
  onOpenPrivacy,
}: RegisterFormProps) {
  const { t } = useTranslation();

  // CNIL Délibération 2021-018 — block submit if no DOB or DOB is malformed.
  // Server re-validates and computes age; this is only a UX guard.
  const dobLooksValid = /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth);
  const disabled = isLoading || isSocialLoading || !gdprAccepted || !dobLooksValid;

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

      <FormInput
        icon="calendar-outline"
        placeholder={t('auth.date_of_birth_placeholder')}
        value={dateOfBirth}
        onChangeText={onChangeDateOfBirth}
        accessibilityLabel={t('auth.date_of_birth_a11y')}
        testID="date-of-birth-input"
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
