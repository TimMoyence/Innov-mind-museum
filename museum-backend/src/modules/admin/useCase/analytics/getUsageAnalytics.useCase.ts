import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type {
  UsageAnalytics,
  UsageAnalyticsFilters,
} from '@modules/admin/domain/admin/admin.types';

/** Delegates usage analytics retrieval to the repository. */
export class GetUsageAnalyticsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  /** Executes the usage analytics retrieval with the given filters. */
  async execute(filters: UsageAnalyticsFilters): Promise<UsageAnalytics> {
    return await this.repository.getUsageAnalytics(filters);
  }
}
