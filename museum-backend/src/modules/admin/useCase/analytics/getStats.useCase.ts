import { computeTenantScope } from '@shared/authz/tenant-scope';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminStats } from '@modules/admin/domain/admin/admin.types';
import type { UserRole } from '@modules/auth/domain/user/user-role';

export interface GetStatsInput {
  role?: UserRole;
  museumId?: number;
}

export class GetStatsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute({ role, museumId }: GetStatsInput = {}): Promise<AdminStats> {
    const scopeMuseumId = computeTenantScope(role, museumId);
    if (scopeMuseumId != null) {
      return await this.repository.getStats(scopeMuseumId);
    }

    return await this.repository.getStats();
  }
}
