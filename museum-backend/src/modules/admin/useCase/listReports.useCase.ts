import { badRequest } from '@shared/errors/app.error';
import type { IAdminRepository } from '../domain/admin.repository.interface';
import type { PaginatedResult, AdminReportDTO, ListReportsFilters } from '../domain/admin.types';

/** Validates pagination and delegates to the repository. */
export class ListReportsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(filters: ListReportsFilters): Promise<PaginatedResult<AdminReportDTO>> {
    const { page, limit } = filters.pagination;

    if (!Number.isInteger(page) || page < 1) {
      throw badRequest('page must be a positive integer');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw badRequest('limit must be between 1 and 100');
    }

    return this.repository.listReports(filters);
  }
}
