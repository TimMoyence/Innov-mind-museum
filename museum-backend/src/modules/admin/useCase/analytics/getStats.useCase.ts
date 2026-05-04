import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminStats } from '@modules/admin/domain/admin/admin.types';

/** Pure delegation to the repository for dashboard statistics. */
export class GetStatsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  /** Retrieves aggregated dashboard statistics. */
  async execute(): Promise<AdminStats> {
    return await this.repository.getStats();
  }
}
