import type { ReactNode } from 'react';
import type React from 'react';
import { createContext, useCallback, useState, useContext, useEffect } from 'react';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';

import { authService } from '@/features/auth/infrastructure/authApi';
import {
  clearAccessToken,
  setAccessToken,
  getAccessToken,
  authStorage,
} from '@/features/auth/infrastructure/authTokenStore';
import { getBiometricEnabled } from '@/features/auth/infrastructure/biometricStore';
import { AUTH_ROUTE } from '@/features/auth/routes';
import { reportError } from '@/shared/observability/errorReporting';

import { extractUserIdFromToken } from '../domain/authLogic.pure';

/** Extracts user ID from a JWT access token and sets Sentry user context. Non-critical — fails silently. */
const identifySentryUser = (accessToken: string): void => {
  const userId = extractUserIdFromToken(accessToken);
  if (userId) Sentry.setUser({ id: userId });
};
import {
  setAuthRefreshHandler,
  setTokenProvider,
  setUnauthorizedHandler,
} from '@/shared/infrastructure/httpClient';

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync().catch(() => {
  /* fire-and-forget */
});

/** Minimal session data needed by `loginWithSession`. */
interface SessionData {
  accessToken: string;
  refreshToken: string;
  user: { onboardingCompleted: boolean };
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isFirstLaunch: boolean | null;
  loginWithSession: (session: SessionData) => Promise<void>;
  markOnboardingComplete: () => Promise<void>;
  logout: () => Promise<void>;
  checkTokenValidity: () => Promise<boolean>;
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
  isBiometricLocked: boolean;
  unlockBiometric: () => void;
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** Manages authentication state. @returns The current auth context including login status, logout, and token validity check. */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
};

/** Provides authentication context to the component tree. Bootstraps the session on mount and manages token refresh and logout. */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isBiometricLocked, setIsBiometricLocked] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);

  const loginWithSession = useCallback(async (session: SessionData) => {
    await authStorage.setRefreshToken(session.refreshToken);
    setAccessToken(session.accessToken);
    setIsAuthenticated(true);
    setIsFirstLaunch(!session.user.onboardingCompleted);
    identifySentryUser(session.accessToken);
  }, []);

  const markOnboardingComplete = useCallback(async () => {
    await authService.completeOnboarding();
    setIsFirstLaunch(false);
  }, []);

  // Check authentication on startup
  useEffect(() => {
    const checkAuth = async (): Promise<void> => {
      try {
        const refreshToken = await authStorage.getRefreshToken();
        if (!refreshToken) {
          setIsAuthenticated(false);
          setIsFirstLaunch(true);
          clearAccessToken();
        } else {
          const session = await authService.refresh(refreshToken);
          await authStorage.setRefreshToken(session.refreshToken);
          setAccessToken(session.accessToken);
          setIsAuthenticated(true);
          setIsFirstLaunch(!session.user.onboardingCompleted);
          identifySentryUser(session.accessToken);
          const biometricOn = await getBiometricEnabled();
          if (biometricOn) {
            setIsBiometricLocked(true);
          }
        }
      } catch (error) {
        await authStorage.clearRefreshToken().catch(() => undefined);
        clearAccessToken();
        setIsAuthenticated(false);
        setIsFirstLaunch(true);
        Sentry.setUser(null);
        reportError(error, { context: 'auth_bootstrap' });
      } finally {
        setIsLoading(false);
        try {
          await SplashScreen.hideAsync();
        } catch {
          /* ignore error */
        }
      }
    };

    void checkAuth();
  }, []);

  useEffect(() => {
    setTokenProvider(getAccessToken);

    setAuthRefreshHandler(async () => {
      const refreshToken = await authStorage.getRefreshToken();
      if (!refreshToken) {
        return null;
      }

      try {
        const session = await authService.refresh(refreshToken);
        await authStorage.setRefreshToken(session.refreshToken);
        setAccessToken(session.accessToken);
        setIsAuthenticated(true);
        setIsFirstLaunch(!session.user.onboardingCompleted);
        identifySentryUser(session.accessToken);
        return session.accessToken;
      } catch {
        await authStorage.clearRefreshToken().catch(() => undefined);
        clearAccessToken();
        setIsAuthenticated(false);
        Sentry.setUser(null);
        return null;
      }
    });

    setUnauthorizedHandler(() => {
      void authStorage.clearRefreshToken().catch(() => {
        /* ignore storage errors */
      });
      clearAccessToken();
      setIsAuthenticated(false);
      setIsFirstLaunch(null);
      Sentry.setUser(null);
      router.replace(AUTH_ROUTE);
    });

    return () => {
      setTokenProvider(null);
      setUnauthorizedHandler(null);
      setAuthRefreshHandler(null);
    };
  }, []);

  const unlockBiometric = useCallback(() => {
    setIsBiometricLocked(false);
  }, []);

  // Logout function
  const logout = async (): Promise<void> => {
    let refreshToken: string | null = null;
    try {
      refreshToken = await authStorage.getRefreshToken();
      await authStorage.clearRefreshToken();
    } catch {
      // Token clear failure is non-critical — proceed with logout
    }

    clearAccessToken();
    setIsAuthenticated(false);
    setIsFirstLaunch(null);
    Sentry.setUser(null);
    router.replace(AUTH_ROUTE);

    try {
      await authService.logout(refreshToken);
    } catch {
      // Logout API failure is non-critical — user is already logged out locally
    }
  };

  const checkTokenValidity = async (): Promise<boolean> => {
    try {
      const refreshToken = await authStorage.getRefreshToken();
      if (!refreshToken) {
        clearAccessToken();
        setIsAuthenticated(false);
        return false;
      }

      const session = await authService.refresh(refreshToken);
      await authStorage.setRefreshToken(session.refreshToken);
      setAccessToken(session.accessToken);
      setIsAuthenticated(true);
      setIsFirstLaunch(!session.user.onboardingCompleted);
      identifySentryUser(session.accessToken);
      return true;
    } catch (error) {
      reportError(error, { context: 'token_validation' });
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        isFirstLaunch,
        loginWithSession,
        markOnboardingComplete,
        logout,
        checkTokenValidity,
        setIsAuthenticated,
        isBiometricLocked,
        unlockBiometric,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
