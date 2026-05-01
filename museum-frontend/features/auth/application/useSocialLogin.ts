import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { authService, type LoginResponse } from '@/features/auth/infrastructure/authApi';
import {
  signInWithApple,
  signInWithGoogle,
  isAppleSignInAvailable,
} from '@/features/auth/infrastructure/socialAuthProviders';
import { getErrorMessage } from '@/shared/lib/errors';

interface UseSocialLoginOptions {
  loginWithSession: (session: LoginResponse) => Promise<void>;
}

interface UseSocialLoginResult {
  handleAppleSignIn: () => Promise<void>;
  handleGoogleSignIn: () => Promise<void>;
  /** Alias for isPending — kept for backward compat with SocialLoginButtons prop. */
  isSocialLoading: boolean;
  appleAuthAvailable: boolean;
  isPending: boolean;
  errorMessage: string | null;
  infoMessage: string | null;
}

/**
 * Hook that encapsulates Apple and Google social sign-in flows.
 * Handles token storage, authentication state, and error reporting
 * via the hook's own return value (no setter DI).
 */
export const useSocialLogin = ({
  loginWithSession,
}: UseSocialLoginOptions): UseSocialLoginResult => {
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAuthAvailable);
  }, []);

  const handleSocialLoginSuccess = async (response: LoginResponse): Promise<void> => {
    if (response.accessToken && response.refreshToken) {
      await loginWithSession(response);
    }
  };

  /**
   * F3 (2026-04-30) — Fetches a single-use OIDC nonce from the backend.
   * Returns `undefined` on transport failure so the caller can still proceed
   * (backend tolerates missing nonce while `OIDC_NONCE_ENFORCE=false`). Once
   * enforce flips on, a missing nonce will be a hard 401 — at that point any
   * transport failure here surfaces as a normal sign-in error downstream.
   */
  const safeRequestNonce = async (): Promise<string | undefined> => {
    try {
      const { nonce } = await authService.requestSocialNonce();
      return nonce;
    } catch {
      return undefined;
    }
  };

  const appleMutation = useMutation({
    mutationFn: async () => {
      const nonce = await safeRequestNonce();
      const { provider, idToken } = await signInWithApple({ nonce });
      const response = await authService.socialLogin(provider, idToken, nonce);
      await handleSocialLoginSuccess(response);
    },
  });

  const googleMutation = useMutation({
    mutationFn: async () => {
      const nonce = await safeRequestNonce();
      const { provider, idToken } = await signInWithGoogle({ nonce });
      const response = await authService.socialLogin(provider, idToken, nonce);
      await handleSocialLoginSuccess(response);
    },
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

  // User-cancelled sign-in is not an error — swallow silently.
  const errorMessage =
    rawError !== null && !rawError.includes('canceled') && !rawError.includes('cancelled')
      ? rawError
      : null;

  return {
    handleAppleSignIn,
    handleGoogleSignIn,
    isSocialLoading,
    appleAuthAvailable,
    isPending: isSocialLoading,
    errorMessage,
    infoMessage: null,
  };
};
