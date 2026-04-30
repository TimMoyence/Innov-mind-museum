import { useEffect, useState } from 'react';

import { authService, type LoginResponse } from '@/features/auth/infrastructure/authApi';
import {
  signInWithApple,
  signInWithGoogle,
  isAppleSignInAvailable,
} from '@/features/auth/infrastructure/socialAuthProviders';
import { getErrorMessage } from '@/shared/lib/errors';

interface UseSocialLoginOptions {
  loginWithSession: (session: LoginResponse) => Promise<void>;
  setErrorMessage: (value: string | null) => void;
  setInfoMessage: (value: string | null) => void;
}

/**
 * Hook that encapsulates Apple and Google social sign-in flows.
 * Handles token storage, authentication state, and error reporting.
 */
export const useSocialLogin = ({
  loginWithSession,
  setErrorMessage,
  setInfoMessage,
}: UseSocialLoginOptions) => {
  const [isSocialLoading, setIsSocialLoading] = useState(false);
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

  const handleAppleSignIn = async (): Promise<void> => {
    setIsSocialLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const nonce = await safeRequestNonce();
      const { provider, idToken } = await signInWithApple({ nonce });
      const response = await authService.socialLogin(provider, idToken, nonce);
      await handleSocialLoginSuccess(response);
    } catch (error) {
      const message = getErrorMessage(error);
      if (!message.includes('canceled') && !message.includes('cancelled')) {
        setErrorMessage(message);
      }
    } finally {
      setIsSocialLoading(false);
    }
  };

  const handleGoogleSignIn = async (): Promise<void> => {
    setIsSocialLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const nonce = await safeRequestNonce();
      const { provider, idToken } = await signInWithGoogle({ nonce });
      const response = await authService.socialLogin(provider, idToken, nonce);
      await handleSocialLoginSuccess(response);
    } catch (error) {
      const message = getErrorMessage(error);
      if (!message.includes('canceled') && !message.includes('cancelled')) {
        setErrorMessage(message);
      }
    } finally {
      setIsSocialLoading(false);
    }
  };

  return {
    handleAppleSignIn,
    handleGoogleSignIn,
    isSocialLoading,
    appleAuthAvailable,
  };
};
