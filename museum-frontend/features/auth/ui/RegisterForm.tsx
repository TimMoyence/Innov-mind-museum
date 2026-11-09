import { useTranslation } from 'react-i18next';
import { Controller, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';

import { parseDateOfBirth } from '@/shared/lib/dateOfBirth';
import { LiquidButton } from '@/shared/ui/LiquidButton';

import { AuthField } from './AuthField';
import { GdprConsentCheckbox } from './GdprConsentCheckbox';
import type { AuthFormValues } from './authFormSchema';

interface RegisterFormProps {
  control: Control<AuthFormValues>;
  isLoading: boolean;
  isSocialLoading: boolean;
  onSubmit: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
}

export function RegisterForm({
  control,
  isLoading,
  isSocialLoading,
  onSubmit,
  onOpenTerms,
  onOpenPrivacy,
}: RegisterFormProps) {
  const { t } = useTranslation();

  return (
    <>
      <AuthField
        control={control}
        name="firstname"
        icon="person-outline"
        placeholder={t('auth.first_name')}
        accessibilityLabel={t('a11y.auth.firstname_input')}
        testID="firstname-input"
        errorTestID="auth-firstname-error"
      />

      <AuthField
        control={control}
        name="lastname"
        icon="person-outline"
        placeholder={t('auth.last_name')}
        accessibilityLabel={t('a11y.auth.lastname_input')}
        testID="lastname-input"
        errorTestID="auth-lastname-error"
      />

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
        variant="password-new"
        testID="password-input"
        accessibilityLabel={t('a11y.auth.password_input')}
        errorTestID="auth-password-error"
      />

      <AuthField
        control={control}
        name="dateOfBirth"
        icon="calendar-outline"
        placeholder={t('auth.date_of_birth_placeholder')}
        accessibilityLabel={t('auth.date_of_birth_a11y')}
        testID="date-of-birth-input"
        errorTestID="auth-dob-error"
      />

      <Controller
        control={control}
        name="gdprAccepted"
        render={({ field: { value, onChange } }) => (
          <GdprConsentCheckbox
            accepted={value ?? false}
            onToggle={() => {
              onChange(!value);
            }}
            onOpenTerms={onOpenTerms}
            onOpenPrivacy={onOpenPrivacy}
          />
        )}
      />

      <RegisterSubmit
        control={control}
        isLoading={isLoading}
        isSocialLoading={isSocialLoading}
        onPress={onSubmit}
      />
    </>
  );
}

interface RegisterSubmitProps {
  control: Control<AuthFormValues>;
  isLoading: boolean;
  isSocialLoading: boolean;
  onPress: () => void;
}

function RegisterSubmit({ control, isLoading, isSocialLoading, onPress }: RegisterSubmitProps) {
  const { t } = useTranslation();
  const gdprAccepted = useWatch({ control, name: 'gdprAccepted' });
  const dateOfBirth = useWatch({ control, name: 'dateOfBirth' });
  const dobLooksValid = parseDateOfBirth(dateOfBirth ?? '') !== null;
  const disabled = isLoading || isSocialLoading || !gdprAccepted || !dobLooksValid;
  return (
    <LiquidButton
      label={t('auth.sign_up')}
      onPress={onPress}
      loading={isLoading || isSocialLoading}
      disabled={disabled}
      accessibilityLabel={t('a11y.auth.register_button')}
      testID="auth-submit"
      variant="primary"
      size="md"
    />
  );
}
