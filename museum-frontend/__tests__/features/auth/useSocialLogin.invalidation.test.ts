/**
 * Tests for TD-TQ-02 — `useSocialLogin` MUST invalidate `['user']` queries
 * on successful Apple / Google sign-in.
 *
 * Spec R7/R8 + design D2/D3 mandate:
 *  - apple happy path → `queryClient.invalidateQueries({ queryKey: ['user'] })`
 *    exactly once.
 *  - google happy path → same.
 *  - mutation reject (user-cancelled, network error) → MUST NOT invalidate.
 *  - missing tokens in the response → MUST NOT invalidate.
 *
 * Implementation pattern (design D2): `handleSocialLoginSuccess` returns a
 * `{ sessionEstablished: boolean }` discriminator; the mutationFn propagates
 * it; the hook-level `onSuccess` invalidates conditionally.
 *
 * lib-docs cite: lib-docs/@tanstack/react-query/PATTERNS.md:109,139.
 *
 * RED contract: the current `useSocialLogin` source contains NO
 * `useQueryClient()` call and NO `onSuccess` invalidation, so the spy stays
 * uncalled in every happy-path assertion below.
 */
import '@/__tests__/helpers/test-utils';
import { act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';

import { renderHookWithQueryClient } from '@/__tests__/helpers/data/renderWithQueryClient';
import { makeAuthTokens } from '@/__tests__/helpers/factories';

// ── Mocks ────────────────────────────────────────────────────────────────────

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

import { useSocialLogin } from '@/features/auth/application/useSocialLogin';

// ── Helpers ──────────────────────────────────────────────────────────────────

const buildHarness = () => {
  const loginWithSession = jest.fn().mockResolvedValue(undefined);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

  const { result } = renderHookWithQueryClient(() => useSocialLogin({ loginWithSession }), {
    queryClient,
  });

  return { result, loginWithSession, invalidateSpy, queryClient };
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useSocialLogin — TD-TQ-02 invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAppleSignInAvailable.mockResolvedValue(true);
    mockRequestSocialNonce.mockResolvedValue({ nonce: 'fixed-nonce' });
    mockSignInWithApple.mockResolvedValue({
      provider: 'apple',
      idToken: 'apple-token-123',
      nonce: 'fixed-nonce',
    });
    mockSignInWithGoogle.mockResolvedValue(makeAuthTokens());
  });

  describe('apple mutation', () => {
    it('invalidates queries with queryKey ["user"] exactly once on happy path', async () => {
      mockSocialLogin.mockResolvedValueOnce(makeAuthTokens());
      const { result, invalidateSpy } = buildHarness();

      await act(async () => {
        await result.current.handleAppleSignIn();
      });

      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user'] });
    });

    it('does NOT invalidate when the Apple SDK rejects (user-cancelled)', async () => {
      mockSignInWithApple.mockRejectedValueOnce(new Error('User canceled'));
      const { result, invalidateSpy } = buildHarness();

      await act(async () => {
        await result.current.handleAppleSignIn().catch(() => undefined);
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('does NOT invalidate when socialLogin returns no tokens', async () => {
      mockSocialLogin.mockResolvedValueOnce({ accessToken: null, refreshToken: null });
      const { result, invalidateSpy, loginWithSession } = buildHarness();

      await act(async () => {
        await result.current.handleAppleSignIn();
      });

      expect(loginWithSession).not.toHaveBeenCalled();
      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('google mutation', () => {
    it('invalidates queries with queryKey ["user"] exactly once on happy path', async () => {
      mockSignInWithGoogle.mockResolvedValueOnce(makeAuthTokens());
      const { result, invalidateSpy } = buildHarness();

      await act(async () => {
        await result.current.handleGoogleSignIn();
      });

      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user'] });
    });

    it('does NOT invalidate when Google sign-in rejects (user-cancelled)', async () => {
      mockSignInWithGoogle.mockRejectedValueOnce(new Error('User cancelled the sign-in'));
      const { result, invalidateSpy } = buildHarness();

      await act(async () => {
        await result.current.handleGoogleSignIn().catch(() => undefined);
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('does NOT invalidate when redeem response lacks tokens', async () => {
      mockSignInWithGoogle.mockResolvedValueOnce({ accessToken: null, refreshToken: null });
      const { result, invalidateSpy, loginWithSession } = buildHarness();

      await act(async () => {
        await result.current.handleGoogleSignIn();
      });

      expect(loginWithSession).not.toHaveBeenCalled();
      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });
});
