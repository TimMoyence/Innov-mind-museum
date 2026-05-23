import { runAuthRefresh, type AuthRefreshResult } from '@/shared/infrastructure/httpClient';

export type { AuthRefreshResult };

/**
 * Auth session façade — thin wrapper around the shared `runAuthRefresh`
 * single-flight primitive.
 *
 * C1 hexagonal (2026-05-23) — created so `features/auth/ui/BiometricGate.tsx`
 * and `features/auth/application/useFaceIdSessionRestore.ts` no longer
 * import from `@/shared/infrastructure/httpClient` directly. `AuthContext`
 * (composition root) keeps the direct shared import: it registers the
 * underlying handler via `setAuthRefreshHandler`, which is conceptually
 * different from invoking the refresh.
 *
 * The wrapper preserves the discriminated `AuthRefreshResult` union
 * (`success | invalid | transient`) so consumer branching is unchanged.
 * Single-flight semantics live in the shared primitive — concurrent calls
 * await the same in-flight promise.
 */
export const authSessionService = {
  /**
   * Triggers an access-token refresh via the registered handler.
   * Returns `AuthRefreshResult` untouched (callers branch on `.kind`).
   */
  async refresh(): Promise<AuthRefreshResult> {
    return runAuthRefresh();
  },
};
