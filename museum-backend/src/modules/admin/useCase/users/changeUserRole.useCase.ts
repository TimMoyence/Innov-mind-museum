import { isActiveAccount, refuseRemovingLastAccount } from '@modules/admin/domain/admin/last-admin';
import { UserRole } from '@modules/auth/domain/user/user-role';
import { auditService, AUDIT_ADMIN_ROLE_CHANGE } from '@shared/audit';
import { AppError, notFound } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';

interface ChangeUserRoleInput {
  userId: number;
  newRole: UserRole;
  actorId: number;
  ip?: string;
  requestId?: string;
}

export class ChangeUserRoleUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(input: ChangeUserRoleInput): Promise<AdminUserDTO> {
    const updated = await this.repository.withPrivilegedAccountsLock(async (repository) => {
      const target = await repository.getUserById(input.userId);
      if (input.newRole === UserRole.SUPER_ADMIN || target?.role === UserRole.SUPER_ADMIN) {
        const actor = await repository.getUserById(input.actorId);
        if (actor?.role !== UserRole.SUPER_ADMIN || !isActiveAccount(actor)) {
          throw new AppError({
            message: 'SUPER_ADMIN_REQUIRED',
            statusCode: 403,
            code: 'SUPER_ADMIN_REQUIRED',
          });
        }
      }
      if (target) {
        await refuseRemovingLastAccount(repository, target, 'DEMOTE', input.newRole);
      }
      return await repository.changeUserRole(input.userId, input.newRole);
    });
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
