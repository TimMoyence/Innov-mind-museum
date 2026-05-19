import { useTranslation } from 'react-i18next';
import { Controller, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';

import { parseDateOfBirth } from '@/shared/lib/dateOfBirth';
import { FormInput } from '@/shared/ui/FormInput';
import { LiquidButton } from '@/shared/ui/LiquidButton';

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

/**
 * Registration form: first/last name, email, password, date of birth, GDPR
 * consent checkbox (with inline terms/privacy links), and submit button.
 *
 * Each input is wrapped in `<Controller>` so subscriptions live in-form and
 * the parent `AuthScreen` does not re-render on keystroke (TD-RHF-01).
 * Field-level errors surface from the Zod resolver via `fieldState.error`.
 * Submit gating (GDPR + DOB) is isolated to `<RegisterSubmit>` so only that
 * subtree re-renders when those two fields change.
 */
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
      <Controller
        control={control}
        name="firstname"
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
          <FormInput
            icon="person-outline"
            placeholder={t('auth.first_name')}
            value={value ?? ''}
            onChangeText={onChange}
            onBlur={onBlur}
            accessibilityLabel={t('a11y.auth.firstname_input')}
            testID="firstname-input"
            error={error?.message}
            errorTestID="auth-firstname-error"
          />
        )}
      />

      <Controller
        control={control}
        name="lastname"
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
          <FormInput
            icon="person-outline"
            placeholder={t('auth.last_name')}
            value={value ?? ''}
            onChangeText={onChange}
            onBlur={onBlur}
            accessibilityLabel={t('a11y.auth.lastname_input')}
            testID="lastname-input"
            error={error?.message}
            errorTestID="auth-lastname-error"
          />
        )}
      />

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
            variant="password-new"
            testID="password-input"
            accessibilityLabel={t('a11y.auth.password_input')}
            error={error?.message}
            errorTestID="auth-password-error"
          />
        )}
      />

      <Controller
        control={control}
        name="dateOfBirth"
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
          <FormInput
            icon="calendar-outline"
            placeholder={t('auth.date_of_birth_placeholder')}
            value={value ?? ''}
            onChangeText={onChange}
            onBlur={onBlur}
            accessibilityLabel={t('auth.date_of_birth_a11y')}
            testID="date-of-birth-input"
            error={error?.message}
            errorTestID="auth-dob-error"
          />
        )}
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

/**
 * Subscribes locally (via `useWatch`) to the only two fields that gate
 * submit — `gdprAccepted` and `dateOfBirth`. Keeps re-renders scoped to this
 * one wrapper instead of bubbling to `AuthScreen`. The DOB parser stays the
 * authoritative UX guard (server re-validates, CNIL Délibération 2021-018).
 */
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
