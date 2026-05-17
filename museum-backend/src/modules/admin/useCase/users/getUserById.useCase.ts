import { notFound } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';

interface GetUserByIdInput {
  userId: number;
}

/** Includes soft-deleted rows (admin detail page). */
export class GetUserByIdUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(input: GetUserByIdInput): Promise<AdminUserDTO> {
    const user = await this.repository.getUserById(input.userId);
    if (!user) {
      throw notFound('User not found');
    }
    return user;
  }
}
