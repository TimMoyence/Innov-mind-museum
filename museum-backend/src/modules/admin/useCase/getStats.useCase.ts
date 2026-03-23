import type { IAdminRepository } from '../domain/admin.repository.interface';
import type { AdminStats } from '../domain/admin.types';

/** Pure delegation to the repository for dashboard statistics. */
export class GetStatsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(): Promise<AdminStats> {
    return this.repository.getStats();
  }
}
