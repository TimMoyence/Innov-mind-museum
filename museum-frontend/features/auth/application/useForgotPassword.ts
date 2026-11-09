import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';

import { authService } from '@/features/auth/infrastructure/authApi';
import { getErrorMessage } from '@/shared/lib/errors';

interface UseForgotPasswordArgs {
  getEmail: () => string;
}

interface UseForgotPasswordResult {
  handleForgotPassword: () => void;
  isPending: boolean;
  errorMessage: string | null;
  infoMessage: string | null;
  clearError: () => void;
}

export function useForgotPassword({ getEmail }: UseForgotPasswordArgs): UseForgotPasswordResult {
  const { t } = useTranslation();
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const email = getEmail();
      await authService.forgotPassword(email);
      Alert.alert(t('auth.email_sent_title'), t('auth.email_sent_message'));
      setInfoMessage(null);
    },
  });

  const handleForgotPassword = useCallback((): void => {
    const email = getEmail();
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
  }, [getEmail, mutation, t]);

  const clearError = useCallback(() => {
    mutation.reset();
    setInfoMessage(null);
  }, [mutation]);

  return {
    handleForgotPassword,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    infoMessage,
    clearError,
  };
}
