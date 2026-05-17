import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminStats } from '@modules/admin/domain/admin/admin.types';

export class GetStatsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(): Promise<AdminStats> {
    return await this.repository.getStats();
  }
}
