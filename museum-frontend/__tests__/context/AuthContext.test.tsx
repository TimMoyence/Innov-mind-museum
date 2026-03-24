import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/context/AuthContext';

// ── Mocks ────────────────────────────────────────────────────────────────────

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
jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    refresh: (...args: unknown[]) => mockRefresh(...args),
    logout: (...args: unknown[]) => mockLogoutApi(...args),
  },
}));

const mockGetRefreshToken = jest.fn();
const mockSetRefreshToken = jest.fn();
const mockClearRefreshToken = jest.fn();
const mockSetAccessToken = jest.fn();
const mockClearAccessToken = jest.fn();
const mockGetAccessToken = jest.fn(() => '');
jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  authStorage: {
    getRefreshToken: (...args: unknown[]) => mockGetRefreshToken(...args),
    setRefreshToken: (...args: unknown[]) => mockSetRefreshToken(...args),
    clearRefreshToken: (...args: unknown[]) => mockClearRefreshToken(...args),
  },
  setAccessToken: (...args: unknown[]) => mockSetAccessToken(...args),
  clearAccessToken: (...args: unknown[]) => mockClearAccessToken(...args),
  getAccessToken: () => mockGetAccessToken(),
}));

jest.mock('@/features/auth/infrastructure/biometricStore', () => ({
  getBiometricEnabled: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('@/shared/infrastructure/httpClient', () => ({
  setAuthRefreshHandler: jest.fn(),
  setTokenProvider: jest.fn(),
  setUnauthorizedHandler: jest.fn(),
}));

jest.mock('@/shared/observability/errorReporting', () => ({
  reportError: jest.fn(),
}));

jest.mock('@/context/authLogic.pure', () => ({
  extractUserIdFromToken: jest.fn(() => 'user-123'),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AuthProvider / useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no stored refresh token
    mockGetRefreshToken.mockResolvedValue(null);
    mockSetRefreshToken.mockResolvedValue(undefined);
    mockClearRefreshToken.mockResolvedValue(undefined);
    mockLogoutApi.mockResolvedValue({});
  });

  it('bootstrap with valid refreshToken sets isAuthenticated=true', async () => {
    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockRefresh.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(mockSetAccessToken).toHaveBeenCalledWith('new-access');
    expect(mockSetRefreshToken).toHaveBeenCalledWith('new-refresh');
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

  it('bootstrap with failing refresh sets isAuthenticated=false and clears tokens', async () => {
    mockGetRefreshToken.mockResolvedValue('stale-refresh');
    mockRefresh.mockRejectedValue(new Error('refresh failed'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(mockClearRefreshToken).toHaveBeenCalled();
    expect(mockClearAccessToken).toHaveBeenCalled();
  });

  it('logout() clears tokens, sets isAuthenticated=false, and redirects', async () => {
    // Start authenticated
    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockRefresh.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    // Now logout
    mockGetRefreshToken.mockResolvedValue('refresh');
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(mockClearAccessToken).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/auth');
  });

  it('checkTokenValidity() returns true on successful refresh', async () => {
    // Bootstrap without token first
    mockGetRefreshToken.mockResolvedValue(null);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Now set up a successful refresh for checkTokenValidity
    mockGetRefreshToken.mockResolvedValue('good-refresh');
    mockRefresh.mockResolvedValue({
      accessToken: 'fresh-access',
      refreshToken: 'fresh-refresh',
    });

    let validity: boolean = false;
    await act(async () => {
      validity = await result.current.checkTokenValidity();
    });

    expect(validity).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('checkTokenValidity() returns false when no refreshToken', async () => {
    mockGetRefreshToken.mockResolvedValue(null);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let validity: boolean = true;
    await act(async () => {
      validity = await result.current.checkTokenValidity();
    });

    expect(validity).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('unlockBiometric() sets isBiometricLocked=false', async () => {
    // Simulate biometric being enabled
    const biometricStore = require('@/features/auth/infrastructure/biometricStore');
    biometricStore.getBiometricEnabled.mockResolvedValue(true);

    mockGetRefreshToken.mockResolvedValue('valid-refresh');
    mockRefresh.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // After bootstrap with biometric enabled, should be locked
    expect(result.current.isBiometricLocked).toBe(true);

    act(() => {
      result.current.unlockBiometric();
    });

    expect(result.current.isBiometricLocked).toBe(false);
  });
});
