import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';

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
  onRegistrationComplete: () => void;
}

interface UseEmailPasswordAuthResult {
  /** Log in with the current email/password state. */
  handleLogin: () => Promise<void>;
  /** Register with the current form state, then auto-login on success. */
  handleRegister: () => Promise<void>;
  isPending: boolean;
  errorMessage: string | null;
  infoMessage: string | null;
  /** Resets login + register mutation errors and clears the info message. */
  clearError: () => void;
}

/**
 * Encapsulates email/password login and registration flows for the
 * auth screen. Both handlers validate required fields, manage the
 * loading + error + info state internally via useMutation, and delegate
 * session creation to the provided `loginWithSession` callback. On
 * successful registration, auto-login is attempted; when it fails (e.g.
 * email verification required), the screen falls back to manual login
 * via `onRegistrationComplete`.
 */
export function useEmailPasswordAuth({
  email,
  password,
  firstname,
  lastname,
  loginWithSession,
  onRegistrationComplete,
}: UseEmailPasswordAuthArgs): UseEmailPasswordAuthResult {
  const { t } = useTranslation();
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: async () => {
      if (!email || !password) {
        Alert.alert(t('common.error'), t('auth.fill_all_fields'));
        return;
      }
      const response = await authService.login(email, password);
      if (response.accessToken && response.refreshToken) {
        await loginWithSession(response);
      } else {
        Alert.alert(t('common.error'), t('auth.login_failed'));
      }
    },
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!email || !password || !firstname || !lastname) {
        Alert.alert(t('common.error'), t('auth.fill_all_fields'));
        return;
      }
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
    },
  });

  const handleLogin = useCallback(async (): Promise<void> => {
    setInfoMessage(null);
    await loginMutation.mutateAsync();
  }, [loginMutation]);

  const handleRegister = useCallback(async (): Promise<void> => {
    setInfoMessage(null);
    await registerMutation.mutateAsync();
  }, [registerMutation]);

  const errorMessage = loginMutation.error
    ? getErrorMessage(loginMutation.error)
    : registerMutation.error
      ? getErrorMessage(registerMutation.error)
      : null;

  const clearError = useCallback(() => {
    loginMutation.reset();
    registerMutation.reset();
    setInfoMessage(null);
  }, [loginMutation, registerMutation]);

  return {
    handleLogin,
    handleRegister,
    isPending: loginMutation.isPending || registerMutation.isPending,
    errorMessage,
    infoMessage,
    clearError,
  };
}
