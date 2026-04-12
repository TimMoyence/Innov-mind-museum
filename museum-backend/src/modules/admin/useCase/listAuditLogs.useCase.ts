import { badRequest } from '@shared/errors/app.error';


import type { IAdminRepository } from '../domain/admin.repository.interface';
import type { AdminAuditLogDTO, ListAuditLogsFilters } from '../domain/admin.types';
import type { PaginatedResult } from '@shared/types/pagination';

/** Validates pagination and delegates to the repository. */
export class ListAuditLogsUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  /** Validates pagination constraints and retrieves a paginated list of audit logs. */
  async execute(filters: ListAuditLogsFilters): Promise<PaginatedResult<AdminAuditLogDTO>> {
    const { page, limit } = filters.pagination;

    if (!Number.isInteger(page) || page < 1) {
      throw badRequest('page must be a positive integer');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw badRequest('limit must be between 1 and 100');
    }

    return await this.repository.listAuditLogs(filters);
  }
}
