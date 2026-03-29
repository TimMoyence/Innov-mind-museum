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

  const handleAppleSignIn = async (): Promise<void> => {
    setIsSocialLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const { provider, idToken } = await signInWithApple();
      const response = await authService.socialLogin(provider, idToken);
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
      const { provider, idToken } = await signInWithGoogle();
      const response = await authService.socialLogin(provider, idToken);
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
