import '@/__tests__/helpers/test-utils';
import { act, waitFor } from '@testing-library/react-native';
import { renderHookWithQueryClient } from '@/__tests__/helpers/data/renderWithQueryClient';
import { useSocialLogin } from '@/features/auth/application/useSocialLogin';
import { makeAuthTokens } from '@/__tests__/helpers/factories';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSignInWithApple = jest.fn<
  Promise<{ provider: 'apple'; idToken: string; nonce?: string }>,
  [unknown?]
>();
// F11-mobile (2026-05) — signInWithGoogle now returns a session directly
// (server-mediated redeem flow), not the legacy {provider, idToken, nonce}.
const mockSignInWithGoogle = jest.fn<Promise<unknown>, []>();
const mockIsAppleSignInAvailable = jest.fn<Promise<boolean>, []>();

jest.mock('@/features/auth/infrastructure/socialAuthProviders', () => ({
  signInWithApple: (opts: unknown) => mockSignInWithApple(opts),
  signInWithGoogle: () => mockSignInWithGoogle(),
  isAppleSignInAvailable: () => mockIsAppleSignInAvailable(),
}));

const mockSocialLogin = jest.fn();
const mockRequestSocialNonce = jest.fn<Promise<{ nonce: string }>, []>();

jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    socialLogin: (...args: unknown[]) => mockSocialLogin(...args),
    requestSocialNonce: () => mockRequestSocialNonce(),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const defaultOptions = () => ({
  loginWithSession: jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined),
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useSocialLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAppleSignInAvailable.mockResolvedValue(true);
    mockRequestSocialNonce.mockResolvedValue({ nonce: 'fixed-nonce' });
    mockSignInWithApple.mockResolvedValue({
      provider: 'apple',
      idToken: 'apple-token-123',
      nonce: 'fixed-nonce',
    });
    // F11-mobile (2026-05) — Google flow returns the session directly via the
    // server-mediated redeem path. The default mock therefore returns a
    // LoginResponse-shaped object, not the legacy {provider, idToken, nonce}.
    mockSignInWithGoogle.mockResolvedValue(makeAuthTokens());
  });

  it('checks Apple Sign-In availability on mount', async () => {
    const opts = defaultOptions();
    const { result } = renderHookWithQueryClient(() => useSocialLogin(opts));

    await waitFor(() => {
      expect(result.current.appleAuthAvailable).toBe(true);
    });

    expect(mockIsAppleSignInAvailable).toHaveBeenCalledTimes(1);
  });

  it('reports Apple not available when device does not support it', async () => {
    mockIsAppleSignInAvailable.mockResolvedValue(false);
    const opts = defaultOptions();

    const { result } = renderHookWithQueryClient(() => useSocialLogin(opts));

    await waitFor(() => {
      expect(result.current.appleAuthAvailable).toBe(false);
    });
  });

  it('completes Google sign-in flow via server-mediated redeem (F11-mobile)', async () => {
    const tokens = makeAuthTokens();
    mockSignInWithGoogle.mockResolvedValue(tokens);
    const opts = defaultOptions();

    const { result } = renderHookWithQueryClient(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleGoogleSignIn();
    });

    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    // No client-side nonce fetch — backend issues + consumes the nonce
    // entirely server-side in the /google/initiate -> /google/callback dance.
    expect(mockRequestSocialNonce).not.toHaveBeenCalled();
    // Redeem flow returns the session directly; /social-login is NOT invoked
    // for Google anymore (Apple still uses it).
    expect(mockSocialLogin).not.toHaveBeenCalled();
    expect(opts.loginWithSession).toHaveBeenCalledWith(tokens);
    expect(result.current.isSocialLoading).toBe(false);
  });

  it('completes Apple sign-in flow successfully', async () => {
    const tokens = makeAuthTokens();
    mockSocialLogin.mockResolvedValue(tokens);
    const opts = defaultOptions();

    const { result } = renderHookWithQueryClient(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleAppleSignIn();
    });

    expect(mockSignInWithApple).toHaveBeenCalledTimes(1);
    expect(mockSignInWithApple).toHaveBeenCalledWith({ nonce: 'fixed-nonce' });
    expect(mockSocialLogin).toHaveBeenCalledWith('apple', 'apple-token-123', 'fixed-nonce');
    expect(opts.loginWithSession).toHaveBeenCalledWith(tokens);
    expect(result.current.isSocialLoading).toBe(false);
  });

  it('suppresses error when user cancels Google sign-in', async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error('User cancelled the sign-in'));
    const opts = defaultOptions();

    const { result } = renderHookWithQueryClient(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleGoogleSignIn().catch(() => undefined);
    });

    // Cancellation messages are filtered out — errorMessage stays null.
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.isSocialLoading).toBe(false);
  });

  it('suppresses error when user cancels Apple sign-in', async () => {
    mockSignInWithApple.mockRejectedValue(new Error('User canceled'));
    const opts = defaultOptions();

    const { result } = renderHookWithQueryClient(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleAppleSignIn().catch(() => undefined);
    });

    expect(result.current.errorMessage).toBeNull();
    expect(result.current.isSocialLoading).toBe(false);
  });

  it('exposes error message on non-cancellation Google sign-in error', async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error('Network error'));
    const opts = defaultOptions();

    const { result } = renderHookWithQueryClient(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleGoogleSignIn().catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.errorMessage).toEqual(expect.stringContaining('Network error'));
    });
    expect(result.current.isSocialLoading).toBe(false);
  });

  it('does not call loginWithSession when redeem response lacks tokens', async () => {
    mockSignInWithGoogle.mockResolvedValue({ accessToken: null, refreshToken: null });
    const opts = defaultOptions();

    const { result } = renderHookWithQueryClient(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleGoogleSignIn();
    });

    expect(opts.loginWithSession).not.toHaveBeenCalled();
  });

  // ── F3 — OIDC nonce binding ───────────────────────────────────────
  describe('F3 nonce', () => {
    it('falls through with undefined nonce when /social-nonce request fails (rollout window)', async () => {
      mockRequestSocialNonce.mockRejectedValue(new Error('network'));
      mockSignInWithApple.mockResolvedValue({ provider: 'apple', idToken: 'apple-tok' });
      mockSocialLogin.mockResolvedValue(makeAuthTokens());
      const opts = defaultOptions();

      const { result } = renderHookWithQueryClient(() => useSocialLogin(opts));
      await act(async () => {
        await result.current.handleAppleSignIn();
      });

      // Apple SDK still invoked (no nonce field) and backend call carries no nonce.
      expect(mockSignInWithApple).toHaveBeenCalledWith({ nonce: undefined });
      expect(mockSocialLogin).toHaveBeenCalledWith('apple', 'apple-tok', undefined);
    });

    // F11-mobile (2026-05) — Google no longer threads the client-side nonce
    // round-trip. The nonce is issued, embedded in the OIDC state, and
    // consumed entirely on the backend during the /google/initiate ->
    // /google/callback redirect dance.
    it('skips client-side nonce fetch on Google flow (server-mediated redeem)', async () => {
      mockRequestSocialNonce.mockResolvedValue({ nonce: 'specific-google-nonce' });
      mockSignInWithGoogle.mockResolvedValue(makeAuthTokens());
      const opts = defaultOptions();

      const { result } = renderHookWithQueryClient(() => useSocialLogin(opts));
      await act(async () => {
        await result.current.handleGoogleSignIn();
      });

      expect(mockRequestSocialNonce).not.toHaveBeenCalled();
      expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
      expect(mockSocialLogin).not.toHaveBeenCalled();
    });
  });
});
