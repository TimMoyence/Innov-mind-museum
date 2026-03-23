import type { IAdminRepository } from '../domain/admin.repository.interface';
import type { UsageAnalytics, UsageAnalyticsFilters } from '../domain/admin.types';

/** Delegates usage analytics retrieval to the repository. */
export class GetUsageAnalyticsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(filters: UsageAnalyticsFilters): Promise<UsageAnalytics> {
    return this.repository.getUsageAnalytics(filters);
  }
}
