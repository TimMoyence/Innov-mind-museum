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
import {
  clearBiometricPreference,
  getBiometricEnabled,
} from '@/features/auth/infrastructure/biometricStore';
import { AUTH_ROUTE } from '@/features/auth/routes';
import { useChatLocalCacheStore } from '@/features/chat/application/chatLocalCache';
import { clearDailyArtStorage } from '@/features/daily-art/application/logoutCleanup';
import { reportError } from '@/shared/observability/errorReporting';
import {
  setAuthRefreshHandler,
  setTokenProvider,
  setUnauthorizedHandler,
} from '@/shared/infrastructure/httpClient';
import { queryClient, resetPersistedCache } from '@/shared/data/queryClient';

import {
  extractUserIdFromToken,
  isAccessTokenExpired,
  isAuthInvalidError,
} from '../domain/authLogic.pure';
import { useAuthAppStateSync } from './useAuthAppStateSync';

/** Extracts user ID from a JWT access token and sets Sentry user context. Non-critical — fails silently. */
const identifySentryUser = (accessToken: string): void => {
  const userId = extractUserIdFromToken(accessToken);
  if (userId) Sentry.setUser({ id: userId });
};

SplashScreen.preventAutoHideAsync().catch(() => {
  /* fire-and-forget */
});

const bootstrapBreadcrumb = (step: string, data?: Record<string, unknown>): void => {
  try {
    Sentry.addBreadcrumb({
      category: 'auth.bootstrap',
      level: 'info',
      message: step,
      data,
    });
  } catch {
    /* Sentry may not be initialised in tests */
  }
};

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

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
};

const persistSessionTokens = async (accessToken: string, refreshToken: string): Promise<void> => {
  await authStorage.setRefreshToken(refreshToken);
  await authStorage.setPersistedAccessToken(accessToken);
};

const clearPersistedTokens = async (): Promise<void> => {
  await authStorage.clearRefreshToken().catch(() => undefined);
  await authStorage.clearPersistedAccessToken().catch(() => undefined);
  clearAccessToken();
};

const clearPerUserFeatureStorage = async (): Promise<void> => {
  const results = await Promise.allSettled([
    useChatLocalCacheStore.getState().clearAll(),
    clearDailyArtStorage(),
    clearBiometricPreference(),
  ]);
  for (const outcome of results) {
    if (outcome.status === 'rejected') {
      reportError(outcome.reason, { context: 'auth_logout_feature_cleanup' });
    }
  }
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isBiometricLocked, setIsBiometricLocked] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);

  const loginWithSession = useCallback(async (session: SessionData) => {
    await persistSessionTokens(session.accessToken, session.refreshToken);
    setAccessToken(session.accessToken);
    setIsAuthenticated(true);
    setIsFirstLaunch(!session.user.onboardingCompleted);
    identifySentryUser(session.accessToken);
  }, []);

  const markOnboardingComplete = useCallback(async () => {
    await authService.completeOnboarding();
    setIsFirstLaunch(false);
  }, []);

  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      const startedAt = Date.now();
      bootstrapBreadcrumb('start');
      try {
        const refreshToken = await authStorage.getRefreshToken();
        if (!refreshToken) {
          await clearPersistedTokens();
          setIsAuthenticated(false);
          setIsFirstLaunch(true);
          bootstrapBreadcrumb('no_refresh_token');
          return;
        }

        // Try the persisted access token first — avoids an unconditional /refresh
        // call on every app launch (which would log the user out on any transient
        // network/backend failure at boot).
        const cachedAccess = await authStorage.getPersistedAccessToken();
        if (cachedAccess && !isAccessTokenExpired(cachedAccess)) {
          setAccessToken(cachedAccess);
          setIsAuthenticated(true);
          identifySentryUser(cachedAccess);
          const biometricOn = await getBiometricEnabled();
          if (biometricOn) setIsBiometricLocked(true);
          bootstrapBreadcrumb('token_valid', { duration_ms: Date.now() - startedAt });
          return;
        }

        // Access token missing or (near-)expired — attempt a refresh.
        try {
          const session = await authService.refresh(refreshToken);
          await persistSessionTokens(session.accessToken, session.refreshToken);
          setAccessToken(session.accessToken);
          setIsAuthenticated(true);
          setIsFirstLaunch(!session.user.onboardingCompleted);
          identifySentryUser(session.accessToken);
          const biometricOn = await getBiometricEnabled();
          if (biometricOn) setIsBiometricLocked(true);
        } catch (refreshError) {
          if (isAuthInvalidError(refreshError)) {
            await clearPersistedTokens();
            setIsAuthenticated(false);
            setIsFirstLaunch(true);
            Sentry.setUser(null);
            return;
          }

          // Network / timeout / 5xx: keep credentials so the user stays logged in
          // when the app recovers connectivity. If a stale cached access token
          // exists, use it — the next authed request will trigger another refresh.
          if (cachedAccess) {
            setAccessToken(cachedAccess);
            setIsAuthenticated(true);
            identifySentryUser(cachedAccess);
            const biometricOn = await getBiometricEnabled();
            if (biometricOn) setIsBiometricLocked(true);
          } else {
            // No cached access token and refresh failed transiently: stay on the
            // auth screen for this launch, but keep the refresh token persisted
            // so the next boot can retry.
            setIsAuthenticated(false);
            setIsFirstLaunch(null);
          }
          reportError(refreshError, { context: 'auth_bootstrap_refresh_transient' });
        }
      } catch (error) {
        reportError(error, { context: 'auth_bootstrap' });
        setIsAuthenticated(false);
        setIsFirstLaunch(true);
      } finally {
        setIsLoading(false);
        bootstrapBreadcrumb('done', { duration_ms: Date.now() - startedAt });
        try {
          await SplashScreen.hideAsync();
        } catch {
          /* ignore error */
        }
      }
    };

    void bootstrap();
  }, []);

  const silentRefresh = useCallback(async (): Promise<string | null> => {
    const refreshToken = await authStorage.getRefreshToken();
    if (!refreshToken) return null;
    try {
      const session = await authService.refresh(refreshToken);
      await persistSessionTokens(session.accessToken, session.refreshToken);
      setAccessToken(session.accessToken);
      identifySentryUser(session.accessToken);
      return session.accessToken;
    } catch {
      return null;
    }
  }, []);

  useAuthAppStateSync(silentRefresh, {
    onForeground: (durationMs) => {
      if (durationMs > 30_000) {
        // User was away long enough that volatile data (notifications, sessions)
        // is likely stale. Invalidate only that scope — everything else stays
        // cached so returning feels instant.
        void queryClient.invalidateQueries({ queryKey: ['me'] });
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    },
  });

  useEffect(() => {
    setTokenProvider(getAccessToken);

    setAuthRefreshHandler(async () => {
      const refreshToken = await authStorage.getRefreshToken();
      if (!refreshToken) {
        return null;
      }

      try {
        const session = await authService.refresh(refreshToken);
        await persistSessionTokens(session.accessToken, session.refreshToken);
        setAccessToken(session.accessToken);
        setIsAuthenticated(true);
        setIsFirstLaunch(!session.user.onboardingCompleted);
        identifySentryUser(session.accessToken);
        return session.accessToken;
      } catch (error) {
        if (isAuthInvalidError(error)) {
          await clearPersistedTokens();
          setIsAuthenticated(false);
          Sentry.setUser(null);
          return null;
        }
        // Network / 5xx during refresh: don't clear tokens. Surface null so the
        // current request fails, but the next attempt can retry with the same
        // refresh token.
        return null;
      }
    });

    setUnauthorizedHandler(() => {
      void clearPersistedTokens();
      void resetPersistedCache();
      void clearPerUserFeatureStorage();
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

  const logout = async (): Promise<void> => {
    let refreshToken: string | null = null;
    try {
      refreshToken = await authStorage.getRefreshToken();
      await clearPersistedTokens();
    } catch {
      // Token clear failure is non-critical — proceed with logout
    }

    await resetPersistedCache();
    await clearPerUserFeatureStorage();
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
        await clearPersistedTokens();
        setIsAuthenticated(false);
        return false;
      }

      const session = await authService.refresh(refreshToken);
      await persistSessionTokens(session.accessToken, session.refreshToken);
      setAccessToken(session.accessToken);
      setIsAuthenticated(true);
      setIsFirstLaunch(!session.user.onboardingCompleted);
      identifySentryUser(session.accessToken);
      return true;
    } catch (error) {
      if (isAuthInvalidError(error)) {
        await clearPersistedTokens();
        setIsAuthenticated(false);
        return false;
      }
      reportError(error, { context: 'token_validation' });
      // Transient failure — preserve the session so the user can keep using
      // the app; the next authed request will retry the refresh flow.
      return isAuthenticated;
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
