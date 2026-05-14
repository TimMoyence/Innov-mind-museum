import { notFound } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';

/** Input for the get-user-by-id admin use case. */
interface GetUserByIdInput {
  userId: number;
}

/** Fetch a single user (including soft-deleted) for the admin detail page. */
export class GetUserByIdUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  /** Returns the user DTO or throws 404. */
  async execute(input: GetUserByIdInput): Promise<AdminUserDTO> {
    const user = await this.repository.getUserById(input.userId);
    if (!user) {
      throw notFound('User not found');
    }
    return user;
  }
}
