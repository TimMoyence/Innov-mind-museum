import { assertPagination } from '@shared/types/pagination';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminReportDTO, ListReportsFilters } from '@modules/admin/domain/admin/admin.types';
import type { PaginatedResult } from '@shared/types/pagination';

export class ListReportsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(filters: ListReportsFilters): Promise<PaginatedResult<AdminReportDTO>> {
    assertPagination(filters.pagination);

    return await this.repository.listReports(filters);
  }
}
