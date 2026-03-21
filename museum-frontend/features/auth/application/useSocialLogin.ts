import { useEffect, useState } from 'react';
import { router } from 'expo-router';

import { authService, type LoginResponse } from '@/features/auth/infrastructure/authApi';
import { authStorage, setAccessToken } from '@/features/auth/infrastructure/authTokenStore';
import {
  signInWithApple,
  signInWithGoogle,
  isAppleSignInAvailable,
} from '@/features/auth/infrastructure/socialAuthProviders';
import { HOME_ROUTE } from '@/features/auth/routes';
import { getErrorMessage } from '@/shared/lib/errors';

interface UseSocialLoginOptions {
  setIsAuthenticated: (value: boolean) => void;
  setErrorMessage: (value: string | null) => void;
  setInfoMessage: (value: string | null) => void;
}

/**
 * Hook that encapsulates Apple and Google social sign-in flows.
 * Handles token storage, authentication state, and error reporting.
 */
export const useSocialLogin = ({
  setIsAuthenticated,
  setErrorMessage,
  setInfoMessage,
}: UseSocialLoginOptions) => {
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAuthAvailable);
  }, []);

  const handleSocialLoginSuccess = async (response: LoginResponse): Promise<void> => {
    if (response?.accessToken && response?.refreshToken) {
      await authStorage.setRefreshToken(response.refreshToken);
      setAccessToken(response.accessToken);
      setIsAuthenticated(true);
      setTimeout(() => {
        router.replace(HOME_ROUTE);
      }, 120);
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
