import { forbidden } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminStats } from '@modules/admin/domain/admin/admin.types';
import type { UserRole } from '@modules/auth/domain/user/user-role';

/**
 * C1A — `/api/admin/stats` tenant scoping (BOLA / OWASP API3:2023 fix).
 *
 * The use-case is the single place the scope decision lives (design D3,
 * mirroring `exportChatSessions.useCase.ts::computeSessionsScope`), so the
 * route stays a thin pass-through:
 *   - `super_admin` / `admin` (or unknown/no role) → global cross-tenant
 *     aggregate (full `AdminStats`, R4 regression-preserved).
 *   - `museum_manager` → tenant-scoped aggregate restricted to their assigned
 *     museum; `403` if they carry no `museumId` claim (R5). The reduced shape
 *     (no platform census) is produced by the repository (D1/D2).
 *
 * The `museumId` the route forwards for a manager is ALWAYS the JWT claim
 * (route force-rewrite, `admin.route.ts`), so a caller-supplied `?museumId=`
 * query param can never widen scope.
 */
export interface GetStatsInput {
  role?: UserRole;
  museumId?: number;
}

export class GetStatsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute({ role, museumId }: GetStatsInput = {}): Promise<AdminStats> {
    if (role === 'museum_manager') {
      // Tenant-scoped — the manager MUST have an assigned museum (same
      // factory/message as the export precedent, design D3).
      if (museumId == null) {
        throw forbidden('No museum assigned');
      }
      return await this.repository.getStats(museumId);
    }

    // super_admin / admin / unknown → global cross-tenant snapshot.
    return await this.repository.getStats();
  }
}
