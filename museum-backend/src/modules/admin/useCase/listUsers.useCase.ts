import { badRequest } from '@shared/errors/app.error';
import type { IAdminRepository } from '../domain/admin.repository.interface';
import type { PaginatedResult, AdminUserDTO, ListUsersFilters } from '../domain/admin.types';

/** Validates pagination, sanitizes search input, and delegates to the repository. */
export class ListUsersUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(filters: ListUsersFilters): Promise<PaginatedResult<AdminUserDTO>> {
    const { page, limit } = filters.pagination;

    if (!Number.isInteger(page) || page < 1) {
      throw badRequest('page must be a positive integer');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw badRequest('limit must be between 1 and 100');
    }

    const sanitizedSearch = filters.search?.trim().slice(0, 200) || undefined;

    return this.repository.listUsers({
      search: sanitizedSearch,
      role: filters.role,
      pagination: { page, limit },
    });
  }
}
