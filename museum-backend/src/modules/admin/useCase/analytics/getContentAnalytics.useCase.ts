import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type {
  ContentAnalytics,
  ContentAnalyticsFilters,
} from '@modules/admin/domain/admin/admin.types';

/** Delegates content analytics retrieval to the repository. */
export class GetContentAnalyticsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  /** Executes the content analytics retrieval with the given filters. */
  async execute(filters: ContentAnalyticsFilters): Promise<ContentAnalytics> {
    return await this.repository.getContentAnalytics(filters);
  }
}
