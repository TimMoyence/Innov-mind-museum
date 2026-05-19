import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { authService } from '@/features/auth/infrastructure/authApi';
import type { useAuth } from '@/features/auth/application/AuthContext';
import { parseDateOfBirth } from '@/shared/lib/dateOfBirth';
import { getErrorMessage } from '@/shared/lib/errors';

/**
 * TD-TQ-02 / design D2 — discriminator returned by mutationFn to tell the
 * hook-level `onSuccess` whether a real session was established (i.e.
 * `loginWithSession()` was called). Only that path warrants invalidating the
 * `['user']` query cache. PATTERNS.md:109,139.
 */
type AuthMutationResult = { sessionEstablished: true } | undefined;

type LoginWithSession = ReturnType<typeof useAuth>['loginWithSession'];

export interface EmailPasswordAuthValues {
  email: string;
  password: string;
  firstname: string;
  lastname: string;
  /** Raw user input — accepted in YYYY-MM-DD, DD/MM/YYYY, etc. Normalized via parseDateOfBirth here. */
  dateOfBirth: string;
}

interface UseEmailPasswordAuthArgs {
  /**
   * Read the current form values at submit time. Lets the parent screen use
   * react-hook-form's `getValues` (or any equivalent) without subscribing the
   * root component to per-keystroke re-renders (TD-RHF-01).
   */
  getValues: () => EmailPasswordAuthValues;
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
  getValues,
  loginWithSession,
  onRegistrationComplete,
}: UseEmailPasswordAuthArgs): UseEmailPasswordAuthResult {
  const { t } = useTranslation();
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // TD-TQ-02 / spec R5/R6/R8 / design D2+D3 — invalidate the `['user']` key
  // prefix (covers `['user','me']` + any future user-scoped query) exactly
  // once per successful session establishment. The `sessionEstablished`
  // discriminator gates the invalidation so validation short-circuits and
  // no-token fall-throughs (which still resolve the mutation) do NOT fire it.
  // PATTERNS.md:109 (mutation onSuccess), :139 (invalidateQueries prefix).
  const invalidateUserOnSession = (result: AuthMutationResult): void => {
    if (result?.sessionEstablished) {
      void queryClient.invalidateQueries({ queryKey: ['user'] });
    }
  };

  const loginMutation = useMutation<AuthMutationResult>({
    mutationFn: async () => {
      const { email, password } = getValues();
      if (!email || !password) {
        Alert.alert(t('common.error'), t('auth.fill_all_fields'));
        return;
      }
      const response = await authService.login(email, password);
      if (response.accessToken && response.refreshToken) {
        await loginWithSession(response);
        return { sessionEstablished: true };
      }
      Alert.alert(t('common.error'), t('auth.login_failed'));
    },
    onSuccess: invalidateUserOnSession,
  });

  const registerMutation = useMutation<AuthMutationResult>({
    mutationFn: async () => {
      const { email, password, firstname, lastname, dateOfBirth } = getValues();
      if (!email || !password || !firstname || !lastname || !dateOfBirth) {
        Alert.alert(t('common.error'), t('auth.fill_all_fields'));
        return;
      }
      const normalizedDob = parseDateOfBirth(dateOfBirth);
      if (!normalizedDob) {
        Alert.alert(t('common.error'), t('auth.fill_all_fields'));
        return;
      }
      await authService.register({
        email,
        password,
        firstname,
        lastname,
        dateOfBirth: normalizedDob,
      });

      // Auto-login after successful registration
      try {
        const response = await authService.login(email, password);
        if (response.accessToken && response.refreshToken) {
          await loginWithSession(response);
          return { sessionEstablished: true };
        }
      } catch {
        // Auto-login failed (e.g. email verification required) — fall back to manual login
      }

      setInfoMessage(t('auth.registration_complete'));
      onRegistrationComplete();
    },
    onSuccess: invalidateUserOnSession,
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
