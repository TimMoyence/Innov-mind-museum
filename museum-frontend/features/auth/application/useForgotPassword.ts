import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';

import { authService } from '@/features/auth/infrastructure/authApi';
import { getErrorMessage } from '@/shared/lib/errors';

interface UseForgotPasswordArgs {
  email: string;
}

interface UseForgotPasswordResult {
  /** Trigger the forgot-password flow for the current email. */
  handleForgotPassword: () => void;
  isPending: boolean;
  errorMessage: string | null;
  infoMessage: string | null;
}

/**
 * Encapsulates the "forgot password" flow triggered from the auth
 * screen: validates the email, shows a confirmation modal (native
 * Alert), and on confirm calls the password reset API, surfacing
 * success or error state through the hook's own return value.
 */
export function useForgotPassword({ email }: UseForgotPasswordArgs): UseForgotPasswordResult {
  const { t } = useTranslation();
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      await authService.forgotPassword(email);
      Alert.alert(t('auth.email_sent_title'), t('auth.email_sent_message'));
      setInfoMessage(null);
    },
  });

  const handleForgotPassword = useCallback((): void => {
    if (!email) {
      Alert.alert(t('common.error'), t('auth.enter_email_for_reset'));
      return;
    }

    Alert.alert(t('auth.password_reset_title'), t('auth.password_reset_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.send'),
        onPress: () => {
          setInfoMessage(null);
          void mutation.mutateAsync();
        },
      },
    ]);
  }, [email, mutation, t]);

  return {
    handleForgotPassword,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    infoMessage,
  };
}
