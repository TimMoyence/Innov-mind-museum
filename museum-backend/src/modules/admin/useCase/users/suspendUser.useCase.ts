import { auditService, AUDIT_ADMIN_USER_SUSPENDED } from '@shared/audit';
import { AppError, notFound } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';

interface SuspendUserInput {
  userId: number;
  actorId: number;
  ip?: string;
  requestId?: string;
}

/** Refuses self-suspension (operator lock-out guard). */
export class SuspendUserUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(input: SuspendUserInput): Promise<AdminUserDTO> {
    if (input.userId === input.actorId) {
      // Custom code so Web admin can pattern-match on 409 (see RoleGuard).
      throw new AppError({
        message: 'CANNOT_SUSPEND_SELF',
        statusCode: 409,
        code: 'CANNOT_SUSPEND_SELF',
      });
    }

    const updated = await this.repository.suspendUser(input.userId);
    if (!updated) {
      throw notFound('User not found');
    }

    await auditService.logActorAction({
      action: AUDIT_ADMIN_USER_SUSPENDED,
      actorId: input.actorId,
      targetType: 'user',
      targetId: String(input.userId),
      metadata: { targetEmail: updated.email, targetRole: updated.role },
      ip: input.ip,
      requestId: input.requestId,
    });

    return updated;
  }
}
