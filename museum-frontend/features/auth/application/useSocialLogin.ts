import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { authService, type LoginResponse } from '@/features/auth/infrastructure/authApi';
import {
  signInWithApple,
  signInWithGoogle,
  isAppleSignInAvailable,
} from '@/features/auth/infrastructure/socialAuthProviders';
import { getErrorMessage } from '@/shared/lib/errors';

/**
 * TD-TQ-02 / design D2 — discriminator returned by mutationFn so the hook-level
 * `onSuccess` can conditionally invalidate `['user']`. Only flows that actually
 * called `loginWithSession()` (i.e. both tokens were present) trigger the
 * invalidation. PATTERNS.md:109,139.
 */
interface SocialMutationResult {
  sessionEstablished: boolean;
}

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
  /** Resets Apple + Google mutation errors. */
  clearError: () => void;
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
  const queryClient = useQueryClient();

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAuthAvailable);
  }, []);

  // TD-TQ-02 / spec R7/R8 / design D2+D3 — returns `{ sessionEstablished }` so
  // the hook-level `onSuccess` can invalidate `['user']` only when the tokens
  // were actually present and `loginWithSession()` was awaited. PATTERNS.md:109.
  const handleSocialLoginSuccess = async (
    response: LoginResponse,
  ): Promise<SocialMutationResult> => {
    if (response.accessToken && response.refreshToken) {
      await loginWithSession(response);
      return { sessionEstablished: true };
    }
    return { sessionEstablished: false };
  };

  // TD-TQ-02 / design D2+D3 — invalidate the `['user']` key prefix exactly once
  // per real session establishment. PATTERNS.md:139.
  const invalidateUserOnSession = (result: SocialMutationResult): void => {
    if (result.sessionEstablished) {
      void queryClient.invalidateQueries({ queryKey: ['user'] });
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

  const appleMutation = useMutation<SocialMutationResult>({
    mutationFn: async () => {
      const requestedNonce = await safeRequestNonce();
      const { provider, idToken, nonce } = await signInWithApple({ nonce: requestedNonce });
      const response = await authService.socialLogin(provider, idToken, nonce);
      return handleSocialLoginSuccess(response);
    },
    onSuccess: invalidateUserOnSession,
  });

  // F11-mobile (2026-05) — Google uses the server-mediated /google/initiate redirect flow:
  // in-app browser → deeplink callback → OTC redeem via /api/auth/social-redeem.
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

  // User-cancelled sign-in is not an error — swallow silently.
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
