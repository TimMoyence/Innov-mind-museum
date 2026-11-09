import { UserRole } from '@modules/auth/domain/user/user-role';
import { auditService, AUDIT_ADMIN_USER_DELETED } from '@shared/audit';
import { AppError, notFound } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';
import type { IRefreshTokenRepository } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';

interface DeleteUserInput {
  userId: number;
  actorId: number;
  ip?: string;
  requestId?: string;
}

export class DeleteUserUseCase {
  constructor(
    private readonly repository: IAdminRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
  ) {}

  async execute(input: DeleteUserInput): Promise<AdminUserDTO> {
    const target = await this.repository.getUserById(input.userId);
    if (!target) {
      throw notFound('User not found');
    }

    const targetIsPrivileged =
      target.role === UserRole.ADMIN || target.role === UserRole.SUPER_ADMIN;
    if (targetIsPrivileged) {
      const adminCount = await this.repository.countAdmins();
      if (adminCount <= 1) {
        throw new AppError({
          message: 'CANNOT_DELETE_LAST_ADMIN',
          statusCode: 409,
          code: 'CANNOT_DELETE_LAST_ADMIN',
        });
      }
    }

    const deleted = await this.repository.softDeleteUser(input.userId);
    if (!deleted) {
      throw notFound('User not found');
    }

    await this.refreshTokenRepository.revokeAllForUser(input.userId);

    await auditService.logActorAction({
      action: AUDIT_ADMIN_USER_DELETED,
      actorId: input.actorId,
      targetType: 'user',
      targetId: String(input.userId),
      metadata: { targetEmail: deleted.email, targetRole: deleted.role },
      ip: input.ip,
      requestId: input.requestId,
    });

    return deleted;
  }
}
