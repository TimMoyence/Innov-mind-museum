import type React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/features/auth/application/AuthContext';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@sentry/react-native', () => ({
  setUser: jest.fn(),
  getClient: jest.fn(() => null),
  captureException: jest.fn(),
}));

const mockRefresh = jest.fn();
const mockLogoutApi = jest.fn();
const mockCompleteOnboarding = jest.fn();
jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    refresh: (...args: unknown[]) => mockRefresh(...args),
    logout: (...args: unknown[]) => mockLogoutApi(...args),
    completeOnboarding: (...args: unknown[]) => mockCompleteOnboarding(...args),
  },
}));

const mockGetRefreshToken = jest.fn();
const mockClearRefreshToken = jest.fn();
const mockGetPersistedAccessToken = jest.fn();
const mockClearPersistedAccessToken = jest.fn();
const mockSetAccessToken = jest.fn();
const mockClearAccessToken = jest.fn();
const mockGetAccessToken = jest.fn(() => 'token-user-A');
jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  authStorage: {
    getRefreshToken: (...args: unknown[]) => mockGetRefreshToken(...args),
    setRefreshToken: jest.fn(() => Promise.resolve()),
    clearRefreshToken: (...args: unknown[]) => mockClearRefreshToken(...args),
    getPersistedAccessToken: (...args: unknown[]) => mockGetPersistedAccessToken(...args),
    setPersistedAccessToken: jest.fn(() => Promise.resolve()),
    clearPersistedAccessToken: (...args: unknown[]) => mockClearPersistedAccessToken(...args),
  },
  setAccessToken: (...args: unknown[]) => mockSetAccessToken(...args),
  clearAccessToken: (...args: unknown[]) => mockClearAccessToken(...args),
  getAccessToken: () => mockGetAccessToken(),
  purgeStaleCredentialsOnFreshInstall: () => Promise.resolve(),
}));

jest.mock('@/features/auth/infrastructure/biometricStore', () => ({
  getBiometricEnabled: jest.fn(() => Promise.resolve(false)),
  clearBiometricPreference: jest.fn(() => Promise.resolve()),
}));

const mockClearChatLocalCache = jest.fn(() => Promise.resolve());
jest.mock('@/features/chat/application/chatLocalCache', () => ({
  useChatLocalCacheStore: {
    getState: () => ({ clearAll: mockClearChatLocalCache }),
  },
}));

const mockClearDailyArtStorage = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('@/features/daily-art/application/logoutCleanup', () => ({
  clearDailyArtStorage: (...args: unknown[]) => mockClearDailyArtStorage(...args),
}));

const mockClearConsentAcceptedFlag = jest.fn(() => Promise.resolve());
jest.mock('@/features/chat/application/useAiConsent', () => ({
  clearConsentAcceptedFlag: () => mockClearConsentAcceptedFlag(),
}));

jest.mock('@/shared/infrastructure/httpClient', () => ({
  setAuthRefreshHandler: jest.fn(),
  setTokenProvider: jest.fn(),
  setUnauthorizedHandler: jest.fn(),
  runAuthRefresh: jest.fn(() => Promise.resolve({ kind: 'transient' })),
}));

jest.mock('@/shared/observability/errorReporting', () => ({
  reportError: jest.fn(),
}));

const mockIsAccessTokenExpired = jest.fn();
jest.mock('@/features/auth/domain/authLogic.pure', () => ({
  extractUserIdFromToken: jest.fn(() => 'user-A'),
  isAccessTokenExpired: (...args: unknown[]) => mockIsAccessTokenExpired(...args),
  isAuthInvalidError: (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const kind = (error as { kind?: string }).kind;
    return kind === 'Unauthorized' || kind === 'Forbidden';
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('AuthContext — consent memo cleared on logout (B8)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockClearRefreshToken.mockResolvedValue(undefined);
    mockGetPersistedAccessToken.mockResolvedValue('cached');
    mockClearPersistedAccessToken.mockResolvedValue(undefined);
    mockIsAccessTokenExpired.mockReturnValue(false);
    mockLogoutApi.mockResolvedValue({});
    mockGetAccessToken.mockReturnValue('token-user-A');
  });

  it('logout() clears the per-user consent memo (R6/AC-B8-1)', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    mockClearConsentAcceptedFlag.mockClear();

    await act(async () => {
      await result.current.logout();
    });

    expect(mockClearConsentAcceptedFlag).toHaveBeenCalledTimes(1);
  });

  it('forced-logout (unauthorizedHandler) clears the per-user consent memo (R6/AC-B8-2)', async () => {
    const httpClient = require('@/shared/infrastructure/httpClient');

    renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(httpClient.setUnauthorizedHandler).toHaveBeenCalled();
    });

    const registeredHandler = (httpClient.setUnauthorizedHandler as jest.Mock).mock.calls
      .map((call: unknown[]) => call[0])
      .find((arg: unknown): arg is () => void => typeof arg === 'function');

    expect(registeredHandler).toBeDefined();

    mockClearConsentAcceptedFlag.mockClear();

    await act(async () => {
      registeredHandler?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockClearConsentAcceptedFlag).toHaveBeenCalledTimes(1);
  });
});
