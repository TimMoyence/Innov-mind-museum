import type { IAdminRepository } from '../domain/admin.repository.interface';
import type { AdminStats } from '../domain/admin.types';

/** Pure delegation to the repository for dashboard statistics. */
export class GetStatsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  /** Retrieves aggregated dashboard statistics. */
  async execute(): Promise<AdminStats> {
    return await this.repository.getStats();
  }
}
