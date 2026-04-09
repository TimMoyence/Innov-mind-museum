import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { authService } from '@/features/auth/infrastructure/authApi';
import type { useAuth } from '@/features/auth/application/AuthContext';
import { getErrorMessage } from '@/shared/lib/errors';

type LoginWithSession = ReturnType<typeof useAuth>['loginWithSession'];

interface UseEmailPasswordAuthArgs {
  email: string;
  password: string;
  firstname: string;
  lastname: string;
  loginWithSession: LoginWithSession;
  setIsLoading: (value: boolean) => void;
  setErrorMessage: (value: string | null) => void;
  setInfoMessage: (value: string | null) => void;
  onRegistrationComplete: () => void;
}

interface UseEmailPasswordAuthResult {
  /** Log in with the current email/password state. */
  handleLogin: () => Promise<void>;
  /** Register with the current form state, then auto-login on success. */
  handleRegister: () => Promise<void>;
}

/**
 * Encapsulates email/password login and registration flows for the
 * auth screen. Both handlers validate required fields, manage the
 * loading + error + info state, and delegate session creation to the
 * provided `loginWithSession` callback. On successful registration,
 * auto-login is attempted; when it fails (e.g. email verification
 * required), the screen falls back to manual login via
 * `onRegistrationComplete`.
 */
export function useEmailPasswordAuth({
  email,
  password,
  firstname,
  lastname,
  loginWithSession,
  setIsLoading,
  setErrorMessage,
  setInfoMessage,
  onRegistrationComplete,
}: UseEmailPasswordAuthArgs): UseEmailPasswordAuthResult {
  const { t } = useTranslation();

  const handleLogin = useCallback(async (): Promise<void> => {
    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.fill_all_fields'));
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const response = await authService.login(email, password);
      if (response.accessToken && response.refreshToken) {
        await loginWithSession(response);
      } else {
        Alert.alert(t('common.error'), t('auth.login_failed'));
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [email, password, loginWithSession, setErrorMessage, setInfoMessage, setIsLoading, t]);

  const handleRegister = useCallback(async (): Promise<void> => {
    if (!email || !password || !firstname || !lastname) {
      Alert.alert(t('common.error'), t('auth.fill_all_fields'));
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      await authService.register({ email, password, firstname, lastname });

      // Auto-login after successful registration
      try {
        const response = await authService.login(email, password);
        if (response.accessToken && response.refreshToken) {
          await loginWithSession(response);
          return;
        }
      } catch {
        // Auto-login failed (e.g. email verification required) — fall back to manual login
      }

      setInfoMessage(t('auth.registration_complete'));
      onRegistrationComplete();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [
    email,
    password,
    firstname,
    lastname,
    loginWithSession,
    onRegistrationComplete,
    setErrorMessage,
    setInfoMessage,
    setIsLoading,
    t,
  ]);

  return { handleLogin, handleRegister };
}
