import type { IAdminRepository } from '../domain/admin.repository.interface';
import type { EngagementAnalytics, EngagementAnalyticsFilters } from '../domain/admin.types';

/** Delegates engagement analytics retrieval to the repository. */
export class GetEngagementAnalyticsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  /** Executes the engagement analytics retrieval with the given filters. */
  async execute(filters: EngagementAnalyticsFilters): Promise<EngagementAnalytics> {
    return await this.repository.getEngagementAnalytics(filters);
  }
}
