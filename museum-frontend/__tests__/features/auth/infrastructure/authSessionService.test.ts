/**
 * C1 Red — authSessionService infra service.
 *
 * Cluster C1 (hexagonal violations, 2026-05-23-frontend-dry-audit) — three
 * call-sites import `runAuthRefresh` from `@/shared/infrastructure/httpClient`:
 *   - `features/auth/ui/BiometricGate.tsx` (UI → transport — worst layering)
 *   - `features/auth/application/useFaceIdSessionRestore.ts` (app layer)
 *   - `features/auth/application/AuthContext.tsx` (legitimate composition root —
 *     it ALSO registers the setters; stays as-is per design.md §Q2 decision (c)).
 *
 * Plan T2.11 introduces a thin wrapper service
 * `features/auth/infrastructure/authSessionService.ts` exposing
 * `authSessionService.refresh()` so BiometricGate + useFaceIdSessionRestore
 * migrate to a proper feature-infra façade.
 *
 * THIS TEST FILE IS RED-PHASE: it must FAIL because
 * `@/features/auth/infrastructure/authSessionService` does not yet exist.
 *
 * Contract: `refresh()` returns the `AuthRefreshResult` discriminated union
 * untouched. Single-flight semantics live in the underlying shared
 * `runAuthRefresh` (we don't re-test that here — only the pass-through).
 */

type RefreshResult =
  | { kind: 'success'; accessToken: string }
  | { kind: 'invalid' }
  | { kind: 'transient' };

const mockRunAuthRefresh = jest.fn<Promise<RefreshResult>, []>();
jest.mock('@/shared/infrastructure/httpClient', () => ({
  runAuthRefresh: () => mockRunAuthRefresh(),
}));

// eslint-disable-next-line import/order, import/first -- mock-first per Jest hoisting rules
import { authSessionService } from '@/features/auth/infrastructure/authSessionService';

describe('authSessionService (C1 hexagonal façade)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refresh() returns the success result from the underlying runAuthRefresh', async () => {
    mockRunAuthRefresh.mockResolvedValueOnce({ kind: 'success', accessToken: 'fresh-jwt' });

    const result = await authSessionService.refresh();

    expect(result).toEqual({ kind: 'success', accessToken: 'fresh-jwt' });
    expect(mockRunAuthRefresh).toHaveBeenCalledTimes(1);
  });

  it('refresh() passes through the invalid discriminator (terminal failure)', async () => {
    mockRunAuthRefresh.mockResolvedValueOnce({ kind: 'invalid' });

    await expect(authSessionService.refresh()).resolves.toEqual({ kind: 'invalid' });
  });

  it('refresh() passes through the transient discriminator (network/5xx)', async () => {
    mockRunAuthRefresh.mockResolvedValueOnce({ kind: 'transient' });

    await expect(authSessionService.refresh()).resolves.toEqual({ kind: 'transient' });
  });

  it('refresh() does not swallow errors thrown by the underlying primitive', async () => {
    const err = new Error('handler-not-registered');
    mockRunAuthRefresh.mockRejectedValueOnce(err);

    await expect(authSessionService.refresh()).rejects.toBe(err);
  });
});
