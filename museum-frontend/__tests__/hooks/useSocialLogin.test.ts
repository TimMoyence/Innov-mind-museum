import '@/__tests__/helpers/test-utils';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useSocialLogin } from '@/features/auth/application/useSocialLogin';
import { makeAuthTokens } from '@/__tests__/helpers/factories';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSignInWithApple = jest.fn<Promise<{ provider: 'apple'; idToken: string }>, []>();
const mockSignInWithGoogle = jest.fn<Promise<{ provider: 'google'; idToken: string }>, []>();
const mockIsAppleSignInAvailable = jest.fn<Promise<boolean>, []>();

jest.mock('@/features/auth/infrastructure/socialAuthProviders', () => ({
  signInWithApple: () => mockSignInWithApple(),
  signInWithGoogle: () => mockSignInWithGoogle(),
  isAppleSignInAvailable: () => mockIsAppleSignInAvailable(),
}));

const mockSocialLogin = jest.fn();

jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    socialLogin: (...args: unknown[]) => mockSocialLogin(...args),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const defaultOptions = () => ({
  loginWithSession: jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined),
  setErrorMessage: jest.fn(),
  setInfoMessage: jest.fn(),
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useSocialLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAppleSignInAvailable.mockResolvedValue(true);
    mockSignInWithApple.mockResolvedValue({ provider: 'apple', idToken: 'apple-token-123' });
    mockSignInWithGoogle.mockResolvedValue({ provider: 'google', idToken: 'google-token-456' });
  });

  it('checks Apple Sign-In availability on mount', async () => {
    const opts = defaultOptions();
    const { result } = renderHook(() => useSocialLogin(opts));

    await waitFor(() => {
      expect(result.current.appleAuthAvailable).toBe(true);
    });

    expect(mockIsAppleSignInAvailable).toHaveBeenCalledTimes(1);
  });

  it('reports Apple not available when device does not support it', async () => {
    mockIsAppleSignInAvailable.mockResolvedValue(false);
    const opts = defaultOptions();

    const { result } = renderHook(() => useSocialLogin(opts));

    await waitFor(() => {
      expect(result.current.appleAuthAvailable).toBe(false);
    });
  });

  it('completes Google sign-in flow successfully', async () => {
    const tokens = makeAuthTokens();
    mockSocialLogin.mockResolvedValue(tokens);
    const opts = defaultOptions();

    const { result } = renderHook(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleGoogleSignIn();
    });

    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(mockSocialLogin).toHaveBeenCalledWith('google', 'google-token-456');
    expect(opts.loginWithSession).toHaveBeenCalledWith(tokens);
    expect(result.current.isSocialLoading).toBe(false);
  });

  it('completes Apple sign-in flow successfully', async () => {
    const tokens = makeAuthTokens();
    mockSocialLogin.mockResolvedValue(tokens);
    const opts = defaultOptions();

    const { result } = renderHook(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleAppleSignIn();
    });

    expect(mockSignInWithApple).toHaveBeenCalledTimes(1);
    expect(mockSocialLogin).toHaveBeenCalledWith('apple', 'apple-token-123');
    expect(opts.loginWithSession).toHaveBeenCalledWith(tokens);
    expect(result.current.isSocialLoading).toBe(false);
  });

  it('suppresses error when user cancels Google sign-in', async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error('User cancelled the sign-in'));
    const opts = defaultOptions();

    const { result } = renderHook(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleGoogleSignIn();
    });

    // setErrorMessage is called with null to clear, but never with an error string
    const errorCalls = opts.setErrorMessage.mock.calls.filter(([arg]: [unknown]) => arg !== null);
    expect(errorCalls).toHaveLength(0);
    expect(result.current.isSocialLoading).toBe(false);
  });

  it('suppresses error when user cancels Apple sign-in', async () => {
    mockSignInWithApple.mockRejectedValue(new Error('User canceled'));
    const opts = defaultOptions();

    const { result } = renderHook(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleAppleSignIn();
    });

    // setErrorMessage is called with null to clear, but never with an error string
    const errorCalls = opts.setErrorMessage.mock.calls.filter(([arg]: [unknown]) => arg !== null);
    expect(errorCalls).toHaveLength(0);
    expect(result.current.isSocialLoading).toBe(false);
  });

  it('sets error message on non-cancellation Google sign-in error', async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error('Network error'));
    const opts = defaultOptions();

    const { result } = renderHook(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleGoogleSignIn();
    });

    expect(opts.setErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Network error'));
    expect(result.current.isSocialLoading).toBe(false);
  });

  it('clears previous error and info messages before sign-in attempt', async () => {
    const tokens = makeAuthTokens();
    mockSocialLogin.mockResolvedValue(tokens);
    const opts = defaultOptions();

    const { result } = renderHook(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleGoogleSignIn();
    });

    expect(opts.setErrorMessage).toHaveBeenCalledWith(null);
    expect(opts.setInfoMessage).toHaveBeenCalledWith(null);
  });

  it('does not call loginWithSession when response lacks tokens', async () => {
    mockSocialLogin.mockResolvedValue({ accessToken: null, refreshToken: null });
    const opts = defaultOptions();

    const { result } = renderHook(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleGoogleSignIn();
    });

    expect(opts.loginWithSession).not.toHaveBeenCalled();
  });
});
