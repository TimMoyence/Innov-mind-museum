import { assertPagination } from '@shared/types/pagination';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type {
  AdminAuditLogDTO,
  ListAuditLogsFilters,
} from '@modules/admin/domain/admin/admin.types';
import type { PaginatedResult } from '@shared/types/pagination';

export class ListAuditLogsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(filters: ListAuditLogsFilters): Promise<PaginatedResult<AdminAuditLogDTO>> {
    assertPagination(filters.pagination);

    return await this.repository.listAuditLogs(filters);
  }
}
