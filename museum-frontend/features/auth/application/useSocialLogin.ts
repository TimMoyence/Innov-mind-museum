import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { authService, type LoginResponse } from '@/features/auth/infrastructure/authApi';
import {
  signInWithApple,
  signInWithGoogle,
  isAppleSignInAvailable,
} from '@/features/auth/infrastructure/socialAuthProviders';
import { getErrorMessage } from '@/shared/lib/errors';

interface SocialMutationResult {
  sessionEstablished: boolean;
}

interface UseSocialLoginOptions {
  loginWithSession: (session: LoginResponse) => Promise<void>;
}

interface UseSocialLoginResult {
  handleAppleSignIn: () => Promise<void>;
  handleGoogleSignIn: () => Promise<void>;
  isSocialLoading: boolean;
  appleAuthAvailable: boolean;
  isPending: boolean;
  errorMessage: string | null;
  infoMessage: string | null;
  clearError: () => void;
}

export const useSocialLogin = ({
  loginWithSession,
}: UseSocialLoginOptions): UseSocialLoginResult => {
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAuthAvailable);
  }, []);

  const handleSocialLoginSuccess = async (
    response: LoginResponse,
  ): Promise<SocialMutationResult> => {
    if (response.accessToken && response.refreshToken) {
      await loginWithSession(response);
      return { sessionEstablished: true };
    }
    return { sessionEstablished: false };
  };

  const invalidateUserOnSession = (result: SocialMutationResult): void => {
    if (result.sessionEstablished) {
      void queryClient.invalidateQueries({ queryKey: ['user'] });
    }
  };

  const safeRequestNonce = async (): Promise<string | undefined> => {
    try {
      const { nonce } = await authService.requestSocialNonce();
      return nonce;
    } catch {
      return undefined;
    }
  };

  const appleMutation = useMutation<SocialMutationResult>({
    mutationFn: async () => {
      const requestedNonce = await safeRequestNonce();
      const { provider, idToken, nonce } = await signInWithApple({ nonce: requestedNonce });
      const response = await authService.socialLogin(provider, idToken, nonce);
      return handleSocialLoginSuccess(response);
    },
    onSuccess: invalidateUserOnSession,
  });

  const googleMutation = useMutation<SocialMutationResult>({
    mutationFn: async () => {
      const session = await signInWithGoogle();
      return handleSocialLoginSuccess(session);
    },
    onSuccess: invalidateUserOnSession,
  });

  const handleAppleSignIn = async (): Promise<void> => {
    await appleMutation.mutateAsync();
  };

  const handleGoogleSignIn = async (): Promise<void> => {
    await googleMutation.mutateAsync();
  };

  const isSocialLoading = appleMutation.isPending || googleMutation.isPending;

  const appleError = appleMutation.error ? getErrorMessage(appleMutation.error) : null;
  const googleError = googleMutation.error ? getErrorMessage(googleMutation.error) : null;
  const rawError = appleError ?? googleError ?? null;

  const errorMessage =
    rawError !== null && !rawError.includes('canceled') && !rawError.includes('cancelled')
      ? rawError
      : null;

  const clearError = (): void => {
    appleMutation.reset();
    googleMutation.reset();
  };

  return {
    handleAppleSignIn,
    handleGoogleSignIn,
    isSocialLoading,
    appleAuthAvailable,
    isPending: isSocialLoading,
    errorMessage,
    infoMessage: null,
    clearError,
  };
};
