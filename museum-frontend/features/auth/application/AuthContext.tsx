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
  purgeStaleCredentialsOnFreshInstall,
} from '@/features/auth/infrastructure/authTokenStore';
import {
  clearBiometricPreference,
  getBiometricEnabled,
} from '@/features/auth/infrastructure/biometricStore';
import { AUTH_ROUTE } from '@/features/auth/routes';
import { useChatLocalCacheStore } from '@/features/chat/application/chatLocalCache';
import { clearConsentAcceptedFlag } from '@/features/chat/application/useAiConsent';
import { clearDailyArtStorage } from '@/features/daily-art/application/logoutCleanup';
import { forgetAcceptedPreferences } from '@/features/settings/infrastructure/accountPreference';
import { reportError } from '@/shared/observability/errorReporting';
import {
  runAuthRefresh,
  setAuthRefreshHandler,
  setTokenProvider,
  setUnauthorizedHandler,
} from '@/shared/infrastructure/httpClient';
import {
  bootstrapProfile,
  resetBootstrapProfileGuard,
} from '@/shared/infrastructure/bootstrapProfile';
import { queryClient, resetPersistedCache } from '@/shared/data/queryClient';

import {
  extractUserIdFromToken,
  isAccessTokenExpired,
  isAuthInvalidError,
} from '../domain/authLogic.pure';
import { useAuthAppStateSync } from './useAuthAppStateSync';

const identifySentryUser = (accessToken: string): void => {
  const userId = extractUserIdFromToken(accessToken);
  if (userId) Sentry.setUser({ id: userId });
};

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const bootstrapBreadcrumb = (step: string, data?: Record<string, unknown>): void => {
  try {
    Sentry.addBreadcrumb({
      category: 'auth.bootstrap',
      level: 'info',
      message: step,
      data,
    });
  } catch {}
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
  forgetAcceptedPreferences();
  const results = await Promise.allSettled([
    useChatLocalCacheStore.getState().clearAll(),
    clearDailyArtStorage(),
    clearBiometricPreference(),
    clearConsentAcceptedFlag(),
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
    void bootstrapProfile();
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
        await purgeStaleCredentialsOnFreshInstall();
        const refreshToken = await authStorage.getRefreshToken();
        if (!refreshToken) {
          await clearPersistedTokens();
          setIsAuthenticated(false);
          setIsFirstLaunch(true);
          bootstrapBreadcrumb('no_refresh_token');
          return;
        }

        const cachedAccess = await authStorage.getPersistedAccessToken();
        if (cachedAccess) {
          setAccessToken(cachedAccess);
          identifySentryUser(cachedAccess);
        }
        setIsAuthenticated(true);
        setIsFirstLaunch(false);
        void bootstrapProfile();
        const biometricOn = await getBiometricEnabled();
        if (biometricOn) setIsBiometricLocked(true);
        bootstrapBreadcrumb(cachedAccess ? 'token_hydrated' : 'token_pending_refresh', {
          duration_ms: Date.now() - startedAt,
          access_expired: cachedAccess ? isAccessTokenExpired(cachedAccess) : true,
        });
      } catch (error) {
        reportError(error, { context: 'auth_bootstrap' });
        setIsAuthenticated(false);
        setIsFirstLaunch(true);
      } finally {
        setIsLoading(false);
        bootstrapBreadcrumb('done', { duration_ms: Date.now() - startedAt });
        try {
          await SplashScreen.hideAsync();
        } catch {}
      }
    };

    void bootstrap();
  }, []);

  const silentRefresh = useCallback(async (): Promise<string | null> => {
    const result = await runAuthRefresh();
    return result.kind === 'success' ? result.accessToken : null;
  }, []);

  useAuthAppStateSync(silentRefresh, {
    onForeground: (durationMs) => {
      if (durationMs > 30_000) {
        void queryClient.invalidateQueries({ queryKey: ['user', 'me'] });
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    },
  });

  useEffect(() => {
    setTokenProvider(getAccessToken);

    setAuthRefreshHandler(async () => {
      const refreshToken = await authStorage.getRefreshToken();
      if (!refreshToken) {
        return { kind: 'invalid' };
      }

      try {
        const session = await authService.refresh(refreshToken);
        await persistSessionTokens(session.accessToken, session.refreshToken);
        setAccessToken(session.accessToken);
        setIsAuthenticated(true);
        setIsFirstLaunch(!session.user.onboardingCompleted);
        identifySentryUser(session.accessToken);
        return { kind: 'success', accessToken: session.accessToken };
      } catch (error) {
        if (isAuthInvalidError(error)) {
          return { kind: 'invalid' };
        }
        return { kind: 'transient' };
      }
    });

    setUnauthorizedHandler(() => {
      void clearPerUserFeatureStorage();
      void clearPersistedTokens();
      void resetPersistedCache();
      setIsAuthenticated(false);
      setIsFirstLaunch(null);
      resetBootstrapProfileGuard();
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
    await clearPerUserFeatureStorage();
    try {
      refreshToken = await authStorage.getRefreshToken();
      await clearPersistedTokens();
    } catch {}

    await resetPersistedCache();
    setIsAuthenticated(false);
    setIsFirstLaunch(null);
    resetBootstrapProfileGuard();
    Sentry.setUser(null);
    router.replace(AUTH_ROUTE);

    try {
      await authService.logout(refreshToken);
    } catch {}
  };

  const checkTokenValidity = async (): Promise<boolean> => {
    const refreshToken = await authStorage.getRefreshToken();
    if (!refreshToken) {
      await clearPersistedTokens();
      setIsAuthenticated(false);
      return false;
    }

    const result = await runAuthRefresh();
    if (result.kind === 'success') {
      return true;
    }
    if (result.kind === 'invalid') {
      return false;
    }
    return isAuthenticated;
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
