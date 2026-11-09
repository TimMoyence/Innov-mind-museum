import type React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/features/auth/application/AuthContext';
import { useAudioDescriptionStore } from '@/features/settings/infrastructure/audioDescriptionStore';
import { createAppError } from '@/shared/types/AppError';

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
const mockSetRefreshToken = jest.fn();
const mockClearRefreshToken = jest.fn();
const mockGetPersistedAccessToken = jest.fn();
const mockSetPersistedAccessToken = jest.fn();
const mockClearPersistedAccessToken = jest.fn();
const mockSetAccessToken = jest.fn();
const mockClearAccessToken = jest.fn();
const mockGetAccessToken = jest.fn(() => '');
jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  authStorage: {
    getRefreshToken: (...args: unknown[]) => mockGetRefreshToken(...args),
    setRefreshToken: (...args: unknown[]) => mockSetRefreshToken(...args),
    clearRefreshToken: (...args: unknown[]) => mockClearRefreshToken(...args),
    getPersistedAccessToken: (...args: unknown[]) => mockGetPersistedAccessToken(...args),
    setPersistedAccessToken: (...args: unknown[]) => mockSetPersistedAccessToken(...args),
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

const mockRunAuthRefresh = jest.fn();
jest.mock('@/shared/infrastructure/httpClient', () => ({
  setAuthRefreshHandler: jest.fn(),
  setTokenProvider: jest.fn(),
  setUnauthorizedHandler: jest.fn(),
  runAuthRefresh: (...args: unknown[]) => mockRunAuthRefresh(...args),
}));

jest.mock('@/shared/observability/errorReporting', () => ({
  reportError: jest.fn(),
}));

const mockSaveProfilePreferences = jest.fn();
jest.mock('@/features/settings/infrastructure/userProfileApi', () => ({
  saveProfilePreferences: (...args: unknown[]) => mockSaveProfilePreferences(...args),
}));

const mockIsAccessTokenExpired = jest.fn();
jest.mock('@/features/auth/domain/authLogic.pure', () => ({
  extractUserIdFromToken: jest.fn(() => 'user-123'),
  isAccessTokenExpired: (...args: unknown[]) => mockIsAccessTokenExpired(...args),
  isAuthInvalidError: (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const kind = (error as { kind?: string }).kind;
    return kind === 'Unauthorized' || kind === 'Forbidden';
  },
}));

const makeSession = (overrides?: Record<string, unknown>) => ({
  accessToken: 'new-access',
  refreshToken: 'new-refresh',
  user: { id: 1, email: 'u@t.com', role: 'visitor', onboardingCompleted: false },
  ...overrides,
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('AuthProvider / useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRefreshToken.mockResolvedValue(null);
    mockSetRefreshToken.mockResolvedValue(undefined);
    mockClearRefreshToken.mockResolvedValue(undefined);
    mockGetPersistedAccessToken.mockResolvedValue(null);
    mockSetPersistedAccessToken.mockResolvedValue(undefined);
    mockClearPersistedAccessToken.mockResolvedValue(undefined);
    mockIsAccessTokenExpired.mockReturnValue(true);
    mockLogoutApi.mockResolvedValue({});
    mockCompleteOnboarding.mockResolvedValue(undefined);
    mockRunAuthRefresh.mockResolvedValue({ kind: 'transient' });
  });

  it('bootstrap hydrates cached access token without calling refresh', async () => {
    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockGetPersistedAccessToken.mockResolvedValue('cached-access');
    mockIsAccessTokenExpired.mockReturnValue(false);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockSetAccessToken).toHaveBeenCalledWith('cached-access');
  });

  it('bootstrap hydrates expired cached access token without calling refresh (defers to interceptor)', async () => {
    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockGetPersistedAccessToken.mockResolvedValue('expired-access');
    mockIsAccessTokenExpired.mockReturnValue(true);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockSetAccessToken).toHaveBeenCalledWith('expired-access');
  });

  it('bootstrap without cached access still flips isAuthenticated when a refresh token is present', async () => {
    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockGetPersistedAccessToken.mockResolvedValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('bootstrap without refreshToken sets isAuthenticated=false', async () => {
    mockGetRefreshToken.mockResolvedValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(mockClearAccessToken).toHaveBeenCalled();
  });

  it('logout() clears tokens, sets isAuthenticated=false, and redirects', async () => {
    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockGetPersistedAccessToken.mockResolvedValue('cached');
    mockIsAccessTokenExpired.mockReturnValue(false);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    mockGetRefreshToken.mockResolvedValue('refresh');
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(mockClearAccessToken).toHaveBeenCalled();
    expect(mockClearPersistedAccessToken).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/auth');
  });

  it('logout() cascades per-user feature storage cleanup', async () => {
    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockGetPersistedAccessToken.mockResolvedValue('cached');
    mockIsAccessTokenExpired.mockReturnValue(false);

    const biometricStore = require('@/features/auth/infrastructure/biometricStore');

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    mockClearChatLocalCache.mockClear();
    mockClearDailyArtStorage.mockClear();
    biometricStore.clearBiometricPreference.mockClear();

    await act(async () => {
      await result.current.logout();
    });

    expect(mockClearChatLocalCache).toHaveBeenCalledTimes(1);
    expect(mockClearDailyArtStorage).toHaveBeenCalledTimes(1);
    expect(biometricStore.clearBiometricPreference).toHaveBeenCalledTimes(1);
  });

  it('M5 · après logout(), un réglage refusé revient à la valeur affichée, jamais à celle du compte précédent', async () => {
    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockGetPersistedAccessToken.mockResolvedValue('cached');
    mockIsAccessTokenExpired.mockReturnValue(false);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });
    useAudioDescriptionStore.getState().mergeFromServer({ audioDescriptionMode: true });

    await act(async () => {
      await result.current.logout();
    });
    useAudioDescriptionStore.setState({ enabled: false });
    mockSaveProfilePreferences.mockResolvedValue(new Error('refus'));
    await act(async () => {
      await useAudioDescriptionStore.getState().setEnabled(true);
    });

    expect(useAudioDescriptionStore.getState().enabled).toBe(false);
  });

  it('setUnauthorizedHandler 401 path cascades per-user feature storage cleanup', async () => {
    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockGetPersistedAccessToken.mockResolvedValue('cached');
    mockIsAccessTokenExpired.mockReturnValue(false);

    const httpClient = require('@/shared/infrastructure/httpClient');
    const biometricStore = require('@/features/auth/infrastructure/biometricStore');

    renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(httpClient.setUnauthorizedHandler).toHaveBeenCalled();
    });

    const registeredHandler = (httpClient.setUnauthorizedHandler as jest.Mock).mock.calls
      .map((call: unknown[]) => call[0])
      .find((arg: unknown): arg is () => void => typeof arg === 'function');

    expect(registeredHandler).toBeDefined();

    mockClearChatLocalCache.mockClear();
    mockClearDailyArtStorage.mockClear();
    biometricStore.clearBiometricPreference.mockClear();

    await act(async () => {
      registeredHandler?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockClearChatLocalCache).toHaveBeenCalledTimes(1);
    expect(mockClearDailyArtStorage).toHaveBeenCalledTimes(1);
    expect(biometricStore.clearBiometricPreference).toHaveBeenCalledTimes(1);
  });

  it('checkTokenValidity() returns true on successful refresh', async () => {
    mockGetRefreshToken.mockResolvedValue(null);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockGetRefreshToken.mockResolvedValue('good-refresh');
    mockRunAuthRefresh.mockResolvedValue({ kind: 'success', accessToken: 'fresh-access' });

    let validity = false;
    await act(async () => {
      validity = await result.current.checkTokenValidity();
    });

    expect(validity).toBe(true);
  });

  it('checkTokenValidity() returns false on terminal refresh failure', async () => {
    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockGetPersistedAccessToken.mockResolvedValue('cached');
    mockIsAccessTokenExpired.mockReturnValue(false);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockRunAuthRefresh.mockResolvedValue({ kind: 'invalid' });

    let validity = true;
    await act(async () => {
      validity = await result.current.checkTokenValidity();
    });

    expect(validity).toBe(false);
  });

  it('checkTokenValidity() returns false when no refreshToken', async () => {
    mockGetRefreshToken.mockResolvedValue(null);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let validity = true;
    await act(async () => {
      validity = await result.current.checkTokenValidity();
    });

    expect(validity).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('unlockBiometric() sets isBiometricLocked=false', async () => {
    const biometricStore = require('@/features/auth/infrastructure/biometricStore');
    biometricStore.getBiometricEnabled.mockResolvedValue(true);

    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockGetPersistedAccessToken.mockResolvedValue('cached');
    mockIsAccessTokenExpired.mockReturnValue(false);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isBiometricLocked).toBe(true);

    act(() => {
      result.current.unlockBiometric();
    });

    expect(result.current.isBiometricLocked).toBe(false);
  });

  it('refresh handler with onboardingCompleted=false sets isFirstLaunch=true', async () => {
    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockGetPersistedAccessToken.mockResolvedValue('cached');
    mockIsAccessTokenExpired.mockReturnValue(false);
    mockRefresh.mockResolvedValue(makeSession({ user: { onboardingCompleted: false } }));

    const httpClient = require('@/shared/infrastructure/httpClient');
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(httpClient.setAuthRefreshHandler).toHaveBeenCalled();
    });

    const handler = (httpClient.setAuthRefreshHandler as jest.Mock).mock.calls
      .map((call: unknown[]) => call[0])
      .find((arg: unknown): arg is () => Promise<unknown> => typeof arg === 'function');

    expect(handler).toBeDefined();

    await act(async () => {
      await handler?.();
    });

    expect(result.current.isFirstLaunch).toBe(true);
  });

  it('refresh handler with onboardingCompleted=true sets isFirstLaunch=false', async () => {
    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockGetPersistedAccessToken.mockResolvedValue('cached');
    mockIsAccessTokenExpired.mockReturnValue(false);
    mockRefresh.mockResolvedValue(makeSession({ user: { onboardingCompleted: true } }));

    const httpClient = require('@/shared/infrastructure/httpClient');
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(httpClient.setAuthRefreshHandler).toHaveBeenCalled();
    });

    const handler = (httpClient.setAuthRefreshHandler as jest.Mock).mock.calls
      .map((call: unknown[]) => call[0])
      .find((arg: unknown): arg is () => Promise<unknown> => typeof arg === 'function');

    expect(handler).toBeDefined();

    await act(async () => {
      await handler?.();
    });

    expect(result.current.isFirstLaunch).toBe(false);
  });

  it('bootstrap without refreshToken sets isFirstLaunch=true', async () => {
    mockGetRefreshToken.mockResolvedValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isFirstLaunch).toBe(true);
  });

  it('markOnboardingComplete() calls API and sets isFirstLaunch=false', async () => {
    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockGetPersistedAccessToken.mockResolvedValue('cached');
    mockIsAccessTokenExpired.mockReturnValue(false);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.markOnboardingComplete();
    });

    expect(mockCompleteOnboarding).toHaveBeenCalled();
    expect(result.current.isFirstLaunch).toBe(false);
  });
});
