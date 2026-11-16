import '@/__tests__/helpers/test-utils';
import { act, waitFor } from '@testing-library/react-native';
import { renderHookWithQueryClient } from '@/__tests__/helpers/data/renderWithQueryClient';
import { useSocialLogin } from '@/features/auth/application/useSocialLogin';
import { makeAppError, makeAuthTokens } from '@/__tests__/helpers/factories';
import { setErrorTranslate } from '@/shared/lib/errors';

const mockSignInWithApple = jest.fn<
  Promise<{ provider: 'apple'; idToken: string; nonce?: string }>,
  [unknown?]
>();
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

const defaultOptions = () => ({
  loginWithSession: jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined),
});

describe('useSocialLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setErrorTranslate((key, opts) => opts?.defaultValue ?? key);
    mockIsAppleSignInAvailable.mockResolvedValue(true);
    mockRequestSocialNonce.mockResolvedValue({ nonce: 'fixed-nonce' });
    mockSignInWithApple.mockResolvedValue({
      provider: 'apple',
      idToken: 'apple-token-123',
      nonce: 'fixed-nonce',
    });
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
    expect(mockRequestSocialNonce).not.toHaveBeenCalled();
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

  it('ANNULATION-SOCIALE · annuler Google n’affiche aucune erreur, même en français', async () => {
    setErrorTranslate((key, opts) =>
      key === 'error.socialAuth.google_cancelled'
        ? 'Connexion Google annulée.'
        : (opts?.defaultValue ?? key),
    );
    mockSignInWithGoogle.mockRejectedValue(
      makeAppError({ kind: 'SocialAuth', code: 'google_cancelled' }),
    );
    const opts = defaultOptions();

    const { result } = renderHookWithQueryClient(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleGoogleSignIn().catch(() => undefined);
    });

    expect(result.current.errorMessage).toBeNull();
    expect(result.current.isSocialLoading).toBe(false);
  });

  it('ANNULATION-SOCIALE · annuler Apple n’affiche aucune erreur', async () => {
    mockSignInWithApple.mockRejectedValue(
      Object.assign(new Error('The user canceled the authorization attempt'), {
        code: 'ERR_REQUEST_CANCELED',
      }),
    );
    const opts = defaultOptions();

    const { result } = renderHookWithQueryClient(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleAppleSignIn().catch(() => undefined);
    });

    expect(result.current.errorMessage).toBeNull();
    expect(result.current.isSocialLoading).toBe(false);
  });

  it('ANNULATION-SOCIALE · un échec Google qui n’est pas une annulation s’affiche', async () => {
    mockSignInWithGoogle.mockRejectedValue(
      makeAppError({ kind: 'SocialAuth', code: 'google_unknown' }),
    );
    const opts = defaultOptions();

    const { result } = renderHookWithQueryClient(() => useSocialLogin(opts));

    await act(async () => {
      await result.current.handleGoogleSignIn().catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.errorMessage).toBe('Sign-in failed. Please try again.');
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

      expect(mockSignInWithApple).toHaveBeenCalledWith({ nonce: undefined });
      expect(mockSocialLogin).toHaveBeenCalledWith('apple', 'apple-tok', undefined);
    });

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
