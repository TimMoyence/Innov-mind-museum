import { assertPagination } from '@shared/types/pagination';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminUserDTO, ListUsersFilters } from '@modules/admin/domain/admin/admin.types';
import type { PaginatedResult } from '@shared/types/pagination';

export class ListUsersUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(filters: ListUsersFilters): Promise<PaginatedResult<AdminUserDTO>> {
    const { page, limit } = assertPagination(filters.pagination);

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
    const sanitizedSearch = filters.search?.trim().slice(0, 200) || undefined;

    return await this.repository.listUsers({
      search: sanitizedSearch,
      role: filters.role,
      pagination: { page, limit },
    });
  }
}
