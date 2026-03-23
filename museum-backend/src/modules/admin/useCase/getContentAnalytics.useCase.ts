import type { IAdminRepository } from '../domain/admin.repository.interface';
import type { ContentAnalytics, ContentAnalyticsFilters } from '../domain/admin.types';

/** Delegates content analytics retrieval to the repository. */
export class GetContentAnalyticsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(filters: ContentAnalyticsFilters): Promise<ContentAnalytics> {
    return this.repository.getContentAnalytics(filters);
  }
}
