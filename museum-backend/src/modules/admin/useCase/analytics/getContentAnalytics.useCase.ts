import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type {
  ContentAnalytics,
  ContentAnalyticsFilters,
} from '@modules/admin/domain/admin/admin.types';

export class GetContentAnalyticsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(filters: ContentAnalyticsFilters): Promise<ContentAnalytics> {
    return await this.repository.getContentAnalytics(filters);
  }
}
