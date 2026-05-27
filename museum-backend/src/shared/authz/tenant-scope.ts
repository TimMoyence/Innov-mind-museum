import { forbidden } from '@shared/errors/app.error';

import type { UserRole } from '@modules/auth/domain/user/user-role';

/**
 * C1B (UFR-022) — single source of truth for the admin tenant-scope decision
 * (BOLA / OWASP API3:2023). Extracted from the inline duplicates that lived in
 * `getStats.useCase.ts` and `exportChatSessions.useCase.ts::computeSessionsScope`
 * once C1B added four more consumers (reviews list+patch, tickets list+patch),
 * bringing the call-site count to six (design-c1b.md D1, ≥ the ≥3 reuse
 * threshold).
 *
 * Decision (mirrors `/stats` D3):
 *   - `super_admin` / `admin` / unknown / undefined → `null` (global,
 *     cross-tenant view; R6 regression-preserved).
 *   - `museum_manager` → forced to their JWT `museumId` claim; a `null`/undefined
 *     claim is a hard `403` (R5) — the manager NEVER degrades to the global view
 *     (that would be a cross-tenant leak).
 *
 * Pure function — no port, no framework, no I/O. The `403` factory + message is
 * shared with the export + stats precedent (`forbidden('No museum assigned')`).
 *
 * NB: `exportChatSessions.useCase.ts` keeps its own role gate (it treats `admin`
 * as tenant-scoped, not global, and rejects visitor/moderator) and only
 * delegates the manager null-claim → 403 path is left to its own logic — see
 * that file. This helper encodes the `/stats`-style decision (admin = global).
 */
export function computeTenantScope(
  role: UserRole | undefined,
  museumId: number | null | undefined,
): number | null {
  if (role === 'museum_manager') {
    if (museumId == null) {
      throw forbidden('No museum assigned');
    }
    return museumId;
  }

  // super_admin / admin / moderator / visitor / unknown → global (cross-tenant).
  return null;
}
