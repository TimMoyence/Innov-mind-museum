import { badRequest } from '@shared/errors/app.error';

import type { IAdminRepository } from '../../domain/admin/admin.repository.interface';
import type { AdminUserDTO, ListUsersFilters } from '../../domain/admin/admin.types';
import type { PaginatedResult } from '@shared/types/pagination';

/** Validates pagination, sanitizes search input, and delegates to the repository. */
export class ListUsersUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  /** Validates pagination, sanitizes search input, and retrieves a paginated user list. */
  async execute(filters: ListUsersFilters): Promise<PaginatedResult<AdminUserDTO>> {
    const { page, limit } = filters.pagination;

    if (!Number.isInteger(page) || page < 1) {
      throw badRequest('page must be a positive integer');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw badRequest('limit must be between 1 and 100');
    }

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
    const sanitizedSearch = filters.search?.trim().slice(0, 200) || undefined;

    return await this.repository.listUsers({
      search: sanitizedSearch,
      role: filters.role,
      pagination: { page, limit },
    });
  }
}
