/**
 * F11-mobile (2026-05) — useFaceIdSessionRestore unit tests.
 *
 * Surfaces a "Continue with Face ID" affordance on the login screen for users
 * who still have a stored refresh token (e.g. cold start where the biometric
 * gate was dismissed, or when the AuthContext bootstrap is bypassed). Returns
 * `canRestore=false` whenever any precondition fails so the UI hides the
 * button cleanly.
 */
import { renderHookWithQueryClient } from '@/__tests__/helpers/data/renderWithQueryClient';
import { act, waitFor } from '@testing-library/react-native';

const mockGetRefreshToken = jest.fn<Promise<string | null>, []>();
const mockGetBiometricEnabled = jest.fn<Promise<boolean>, []>();
const mockAuthenticate = jest.fn<Promise<boolean>, []>();
const mockRunAuthRefresh = jest.fn();

jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  authStorage: {
    getRefreshToken: () => mockGetRefreshToken(),
  },
}));

jest.mock('@/features/auth/infrastructure/biometricStore', () => ({
  getBiometricEnabled: () => mockGetBiometricEnabled(),
}));

jest.mock('@/shared/infrastructure/httpClient', () => ({
  runAuthRefresh: () => mockRunAuthRefresh(),
}));

jest.mock('@/features/auth/application/useBiometricAuth', () => ({
  useBiometricAuth: () => ({
    isAvailable: true,
    isEnabled: true,
    biometricLabel: 'Face ID',
    isChecking: false,
    authenticate: mockAuthenticate,
    enable: jest.fn(),
    disable: jest.fn(),
  }),
}));

import { useFaceIdSessionRestore } from '@/features/auth/application/useFaceIdSessionRestore';

describe('useFaceIdSessionRestore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRefreshToken.mockResolvedValue('stored-refresh-token');
    mockGetBiometricEnabled.mockResolvedValue(true);
    mockAuthenticate.mockResolvedValue(true);
    mockRunAuthRefresh.mockResolvedValue({ kind: 'success', accessToken: 'new-access' });
  });

  it('reports canRestore=true when a refresh token is stored AND biometric is enabled', async () => {
    const { result } = renderHookWithQueryClient(() => useFaceIdSessionRestore());

    await waitFor(() => {
      expect(result.current.canRestore).toBe(true);
    });
  });

  it('reports canRestore=false when no refresh token is stored', async () => {
    mockGetRefreshToken.mockResolvedValue(null);
    const { result } = renderHookWithQueryClient(() => useFaceIdSessionRestore());

    // Wait one tick so the effect resolves before asserting.
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    expect(result.current.canRestore).toBe(false);
  });

  it('reports canRestore=false when biometric is disabled', async () => {
    mockGetBiometricEnabled.mockResolvedValue(false);
    const { result } = renderHookWithQueryClient(() => useFaceIdSessionRestore());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    expect(result.current.canRestore).toBe(false);
  });

  it('restore() prompts biometric and refreshes the session on success', async () => {
    const { result } = renderHookWithQueryClient(() => useFaceIdSessionRestore());

    await waitFor(() => {
      expect(result.current.canRestore).toBe(true);
    });

    let restored = false;
    await act(async () => {
      restored = await result.current.restore();
    });

    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    expect(mockRunAuthRefresh).toHaveBeenCalledTimes(1);
    expect(restored).toBe(true);
  });

  it('restore() returns false when biometric is rejected', async () => {
    mockAuthenticate.mockResolvedValue(false);
    const { result } = renderHookWithQueryClient(() => useFaceIdSessionRestore());

    await waitFor(() => {
      expect(result.current.canRestore).toBe(true);
    });

    let restored = true;
    await act(async () => {
      restored = await result.current.restore();
    });

    expect(restored).toBe(false);
    // Refresh must NOT be attempted when biometric fails.
    expect(mockRunAuthRefresh).not.toHaveBeenCalled();
  });

  it('restore() returns false when the refresh call fails', async () => {
    mockRunAuthRefresh.mockResolvedValue({ kind: 'invalid' });
    const { result } = renderHookWithQueryClient(() => useFaceIdSessionRestore());

    await waitFor(() => {
      expect(result.current.canRestore).toBe(true);
    });

    let restored = true;
    await act(async () => {
      restored = await result.current.restore();
    });

    expect(restored).toBe(false);
  });
});
