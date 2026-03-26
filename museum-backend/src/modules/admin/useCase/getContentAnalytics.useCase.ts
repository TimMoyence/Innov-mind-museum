import type { IAdminRepository } from '../domain/admin.repository.interface';
import type { ContentAnalytics, ContentAnalyticsFilters } from '../domain/admin.types';

/** Delegates content analytics retrieval to the repository. */
export class GetContentAnalyticsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  /** Executes the content analytics retrieval with the given filters. */
  async execute(filters: ContentAnalyticsFilters): Promise<ContentAnalytics> {
    return await this.repository.getContentAnalytics(filters);
  }
}
