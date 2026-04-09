import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { authService } from '@/features/auth/infrastructure/authApi';
import { getErrorMessage } from '@/shared/lib/errors';

interface UseForgotPasswordArgs {
  email: string;
  setIsLoading: (value: boolean) => void;
  setErrorMessage: (value: string | null) => void;
  setInfoMessage: (value: string | null) => void;
}

interface UseForgotPasswordResult {
  /** Trigger the forgot-password flow for the current email. */
  handleForgotPassword: () => void;
}

/**
 * Encapsulates the "forgot password" flow triggered from the auth
 * screen: validates the email, shows a confirmation modal (native
 * Alert), and on confirm calls the password reset API, surfacing
 * success or error state through the parent screen's setters.
 */
export function useForgotPassword({
  email,
  setIsLoading,
  setErrorMessage,
  setInfoMessage,
}: UseForgotPasswordArgs): UseForgotPasswordResult {
  const { t } = useTranslation();

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
          void (async () => {
            setIsLoading(true);
            setErrorMessage(null);
            setInfoMessage(null);
            try {
              await authService.forgotPassword(email);
              Alert.alert(t('auth.email_sent_title'), t('auth.email_sent_message'));
            } catch (error) {
              setErrorMessage(getErrorMessage(error));
            } finally {
              setIsLoading(false);
            }
          })();
        },
      },
    ]);
  }, [email, setErrorMessage, setInfoMessage, setIsLoading, t]);

  return { handleForgotPassword };
}
