import { UserRole } from '@modules/auth/domain/user/user-role';
import { auditService, AUDIT_ADMIN_ROLE_CHANGE } from '@shared/audit';
import { badRequest, notFound, conflict } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';

interface ChangeUserRoleInput {
  userId: number;
  newRole: string;
  actorId: number;
  ip?: string;
  requestId?: string;
}

export class ChangeUserRoleUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(input: ChangeUserRoleInput): Promise<AdminUserDTO> {
    const validRoles: string[] = Object.values(UserRole);

    if (!validRoles.includes(input.newRole)) {
      throw badRequest(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    // Guard: prevent removing the last admin.
    if (input.newRole !== UserRole.ADMIN) {
      const adminCount = await this.repository.countAdmins();
      if (adminCount <= 1) {
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

    await auditService.logActorAction({
      action: AUDIT_ADMIN_ROLE_CHANGE,
      actorId: input.actorId,
      targetType: 'user',
      targetId: String(input.userId),
      metadata: { newRole: input.newRole },
      ip: input.ip,
      requestId: input.requestId,
    });

    return updated;
  }
}
