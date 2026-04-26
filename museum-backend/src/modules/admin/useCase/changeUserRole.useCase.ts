import { UserRole } from '@modules/auth/domain/user-role';
import { auditService, AUDIT_ADMIN_ROLE_CHANGE } from '@shared/audit';
import { badRequest, notFound, conflict } from '@shared/errors/app.error';

import type { IAdminRepository } from '../domain/admin.repository.interface';
import type { AdminUserDTO } from '../domain/admin.types';

/** Input for the change-user-role use case. */
interface ChangeUserRoleInput {
  userId: number;
  newRole: string;
  actorId: number;
  ip?: string;
  requestId?: string;
}

/** Validates the new role, prevents removing the last admin, and updates the user's role. */
export class ChangeUserRoleUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  /** Executes the role change after validating the new role and preventing removal of the last admin. */
  async execute(input: ChangeUserRoleInput): Promise<AdminUserDTO> {
    const validRoles: string[] = Object.values(UserRole);

    if (!validRoles.includes(input.newRole)) {
      throw badRequest(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    // Guard: prevent removing the last admin
    if (input.newRole !== UserRole.ADMIN) {
      const adminCount = await this.repository.countAdmins();
      if (adminCount <= 1) {
        // Check whether the target user is the sole remaining admin
        const result = await this.repository.listUsers({
          pagination: { page: 1, limit: 1 },
          role: UserRole.ADMIN,
          search: undefined,
        });
        if (result.total <= 1 && result.data.length > 0 && result.data[0].id === input.userId) {
          throw conflict('Cannot remove the last admin');
        }
      }
    }

    const updated = await this.repository.changeUserRole(input.userId, input.newRole);
    if (!updated) {
      throw notFound('User not found');
    }

    await auditService.log({
      action: AUDIT_ADMIN_ROLE_CHANGE,
      actorType: 'user',
      actorId: input.actorId,
      targetType: 'user',
      targetId: String(input.userId),
      metadata: { newRole: input.newRole },
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
    });

    return updated;
  }
}
