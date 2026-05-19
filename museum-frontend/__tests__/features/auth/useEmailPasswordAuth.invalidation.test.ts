/**
 * Tests for TD-TQ-02 — `useEmailPasswordAuth` MUST invalidate
 * `['user']` queries on successful login / register (auto-login path).
 *
 * Spec R5/R6/R8 + design D2/D3 mandate:
 *  - login happy path → `queryClient.invalidateQueries({ queryKey: ['user'] })`
 *    exactly once.
 *  - register happy path (with auto-login) → invalidate exactly once.
 *  - validation short-circuit / no-token / mutation reject / auto-login fail
 *    branches → MUST NOT invalidate (R8 negative).
 *
 * Implementation pattern (design D2): the `mutationFn` returns a discriminator
 * `{ sessionEstablished: true }` only on paths that called `loginWithSession`;
 * `onSuccess` invalidates conditionally on that discriminator.
 *
 * lib-docs cite: lib-docs/@tanstack/react-query/PATTERNS.md:109,139,201.
 *
 * RED contract: the current `useEmailPasswordAuth` source contains NO
 * `useQueryClient()` call and NO `onSuccess` invalidation, so the spy stays
 * uncalled in every assertion below.
 */
import '@/__tests__/helpers/test-utils';
import { act, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';

import { renderHookWithQueryClient } from '@/__tests__/helpers/data/renderWithQueryClient';
import { makeAuthTokens } from '@/__tests__/helpers/factories';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockLogin = jest.fn();
const mockRegister = jest.fn();

jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    login: (...args: unknown[]) => mockLogin(...args),
    register: (...args: unknown[]) => mockRegister(...args),
  },
}));

// Alerts are non-blocking in tests; we only want to assert their absence does
// NOT trigger invalidation downstream.
jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);

import { useEmailPasswordAuth } from '@/features/auth/application/useEmailPasswordAuth';

// ── Helpers ──────────────────────────────────────────────────────────────────

interface HarnessOptions {
  values?: Partial<{
    email: string;
    password: string;
    firstname: string;
    lastname: string;
    dateOfBirth: string;
  }>;
}

const buildHarness = (opts: HarnessOptions = {}) => {
  const values = {
    email: 'visitor@test.com',
    password: 'hunter22',
    firstname: 'Vito',
    lastname: 'Corleone',
    dateOfBirth: '1990-05-15',
    ...opts.values,
  };
  const loginWithSession = jest.fn().mockResolvedValue(undefined);
  const onRegistrationComplete = jest.fn();

  // Wrap a real QueryClient so we can spy on its instance method directly —
  // gives the strongest signal that the hook's onSuccess truly calls the API.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

  const { result } = renderHookWithQueryClient(
    () =>
      useEmailPasswordAuth({
        getValues: () => values,
        loginWithSession,
        onRegistrationComplete,
      }),
    { queryClient },
  );

  return { result, loginWithSession, onRegistrationComplete, invalidateSpy, queryClient };
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useEmailPasswordAuth — TD-TQ-02 invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login mutation', () => {
    it('invalidates queries with queryKey ["user"] exactly once on happy path', async () => {
      mockLogin.mockResolvedValueOnce(makeAuthTokens());
      const { result, invalidateSpy } = buildHarness();

      await act(async () => {
        await result.current.handleLogin();
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledTimes(1);
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user'] });
    });

    it('does NOT invalidate when validation short-circuits (empty email)', async () => {
      const { result, invalidateSpy } = buildHarness({
        values: { email: '', password: 'hunter22' },
      });

      await act(async () => {
        await result.current.handleLogin();
      });

      expect(mockLogin).not.toHaveBeenCalled();
      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('does NOT invalidate when the backend returns a no-token response', async () => {
      mockLogin.mockResolvedValueOnce({ accessToken: null, refreshToken: null });
      const { result, invalidateSpy, loginWithSession } = buildHarness();

      await act(async () => {
        await result.current.handleLogin();
      });

      expect(loginWithSession).not.toHaveBeenCalled();
      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('does NOT invalidate when the login mutation rejects (R8 negative)', async () => {
      mockLogin.mockRejectedValueOnce(new Error('network down'));
      const { result, invalidateSpy } = buildHarness();

      await act(async () => {
        await result.current.handleLogin().catch(() => undefined);
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('register mutation', () => {
    it('invalidates queries with queryKey ["user"] exactly once on auto-login happy path', async () => {
      mockRegister.mockResolvedValueOnce(undefined);
      mockLogin.mockResolvedValueOnce(makeAuthTokens());
      const { result, invalidateSpy } = buildHarness();

      await act(async () => {
        await result.current.handleRegister();
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledTimes(1);
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user'] });
    });

    it('does NOT invalidate when auto-login throws (manual login fallback path)', async () => {
      mockRegister.mockResolvedValueOnce(undefined);
      mockLogin.mockRejectedValueOnce(new Error('email verification required'));
      const { result, invalidateSpy, onRegistrationComplete } = buildHarness();

      await act(async () => {
        await result.current.handleRegister();
      });

      // No session established → no invalidation.
      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(onRegistrationComplete).toHaveBeenCalledTimes(1);
    });

    it('does NOT invalidate when validation short-circuits (missing firstname)', async () => {
      const { result, invalidateSpy } = buildHarness({
        values: { firstname: '' },
      });

      await act(async () => {
        await result.current.handleRegister();
      });

      expect(mockRegister).not.toHaveBeenCalled();
      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });
});
