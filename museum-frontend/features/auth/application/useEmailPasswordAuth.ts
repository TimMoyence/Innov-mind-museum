import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { authService } from '@/features/auth/infrastructure/authApi';
import type { useAuth } from '@/features/auth/application/AuthContext';
import { parseDateOfBirth } from '@/shared/lib/dateOfBirth';
import { getErrorMessage } from '@/shared/lib/errors';

type AuthMutationResult = { sessionEstablished: true } | undefined;

type LoginWithSession = ReturnType<typeof useAuth>['loginWithSession'];

export interface EmailPasswordAuthValues {
  email: string;
  password: string;
  firstname: string;
  lastname: string;
  dateOfBirth: string;
}

interface UseEmailPasswordAuthArgs {
  getValues: () => EmailPasswordAuthValues;
  loginWithSession: LoginWithSession;
  onRegistrationComplete: () => void;
}

interface UseEmailPasswordAuthResult {
  handleLogin: () => Promise<void>;
  handleRegister: () => Promise<void>;
  isPending: boolean;
  errorMessage: string | null;
  infoMessage: string | null;
  clearError: () => void;
}

export function useEmailPasswordAuth({
  getValues,
  loginWithSession,
  onRegistrationComplete,
}: UseEmailPasswordAuthArgs): UseEmailPasswordAuthResult {
  const { t } = useTranslation();
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

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

      try {
        const response = await authService.login(email, password);
        if (response.accessToken && response.refreshToken) {
          await loginWithSession(response);
          return { sessionEstablished: true };
        }
      } catch {}

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
