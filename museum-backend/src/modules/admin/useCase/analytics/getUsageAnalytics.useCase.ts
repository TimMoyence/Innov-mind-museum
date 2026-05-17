import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type {
  UsageAnalytics,
  UsageAnalyticsFilters,
} from '@modules/admin/domain/admin/admin.types';

export class GetUsageAnalyticsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(filters: UsageAnalyticsFilters): Promise<UsageAnalytics> {
    return await this.repository.getUsageAnalytics(filters);
  }
}
