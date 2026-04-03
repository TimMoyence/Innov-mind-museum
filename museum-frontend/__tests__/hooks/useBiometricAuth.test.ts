import '@/__tests__/helpers/test-utils';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useBiometricAuth } from '@/features/auth/application/useBiometricAuth';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockHasHardwareAsync = jest.fn<Promise<boolean>, []>();
const mockIsEnrolledAsync = jest.fn<Promise<boolean>, []>();
const mockSupportedAuthenticationTypesAsync = jest.fn<Promise<number[]>, []>();
const mockAuthenticateAsync = jest.fn<Promise<{ success: boolean }>, []>();

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: () => mockHasHardwareAsync(),
  isEnrolledAsync: () => mockIsEnrolledAsync(),
  supportedAuthenticationTypesAsync: () => mockSupportedAuthenticationTypesAsync(),
  authenticateAsync: (opts: unknown) => mockAuthenticateAsync(),
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
}));

const mockGetBiometricEnabled = jest.fn<Promise<boolean>, []>();
const mockSetBiometricEnabled = jest.fn<Promise<void>, [boolean]>();

jest.mock('@/features/auth/infrastructure/biometricStore', () => ({
  getBiometricEnabled: () => mockGetBiometricEnabled(),
  setBiometricEnabled: (v: boolean) => mockSetBiometricEnabled(v),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useBiometricAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasHardwareAsync.mockResolvedValue(true);
    mockIsEnrolledAsync.mockResolvedValue(true);
    mockSupportedAuthenticationTypesAsync.mockResolvedValue([2]); // FACIAL_RECOGNITION
    mockGetBiometricEnabled.mockResolvedValue(false);
    mockAuthenticateAsync.mockResolvedValue({ success: true });
    mockSetBiometricEnabled.mockResolvedValue(undefined);
  });

  it('detects available biometric hardware and sets Face ID label', async () => {
    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isAvailable).toBe(true);
    expect(result.current.biometricLabel).toBe('Face ID');
  });

  it('sets Touch ID label when only fingerprint is available', async () => {
    mockSupportedAuthenticationTypesAsync.mockResolvedValue([1]); // FINGERPRINT

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.biometricLabel).toBe('Touch ID');
  });

  it('sets Iris label when only iris is available', async () => {
    mockSupportedAuthenticationTypesAsync.mockResolvedValue([3]); // IRIS

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.biometricLabel).toBe('Iris');
  });

  it('marks hardware as unavailable when no biometric hardware exists', async () => {
    mockHasHardwareAsync.mockResolvedValue(false);

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isAvailable).toBe(false);
    expect(result.current.biometricLabel).toBe('');
  });

  it('marks hardware as unavailable when not enrolled', async () => {
    mockIsEnrolledAsync.mockResolvedValue(false);

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isAvailable).toBe(false);
  });

  it('loads stored biometric preference on mount', async () => {
    mockGetBiometricEnabled.mockResolvedValue(true);

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isEnabled).toBe(true);
    expect(mockGetBiometricEnabled).toHaveBeenCalledTimes(1);
  });

  it('authenticates successfully and returns true', async () => {
    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.authenticate();
    });

    expect(success).toBe(true);
    expect(mockAuthenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('returns false when authentication fails', async () => {
    mockAuthenticateAsync.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.authenticate();
    });

    expect(success).toBe(false);
  });

  it('enables biometric after successful authentication', async () => {
    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    await act(async () => {
      await result.current.enable();
    });

    expect(mockSetBiometricEnabled).toHaveBeenCalledWith(true);
    expect(result.current.isEnabled).toBe(true);
  });

  it('does not enable biometric when authentication fails', async () => {
    mockAuthenticateAsync.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.enable();
    });

    expect(success).toBe(false);
    expect(mockSetBiometricEnabled).not.toHaveBeenCalled();
    expect(result.current.isEnabled).toBe(false);
  });

  it('disables biometric and persists the preference', async () => {
    mockGetBiometricEnabled.mockResolvedValue(true);

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isEnabled).toBe(true);

    await act(async () => {
      await result.current.disable();
    });

    expect(mockSetBiometricEnabled).toHaveBeenCalledWith(false);
    expect(result.current.isEnabled).toBe(false);
  });

  it('handles hardware check error gracefully', async () => {
    mockHasHardwareAsync.mockRejectedValue(new Error('Hardware check failed'));

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isAvailable).toBe(false);
  });
});
