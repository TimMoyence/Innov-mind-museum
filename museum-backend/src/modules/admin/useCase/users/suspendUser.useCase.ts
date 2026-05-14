import { auditService, AUDIT_ADMIN_USER_SUSPENDED } from '@shared/audit';
import { AppError, notFound } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';

/** Input for the suspend-user admin use case. */
interface SuspendUserInput {
  userId: number;
  actorId: number;
  ip?: string;
  requestId?: string;
}

/** Set users.suspended=true. Refuses self-suspension (operator lock-out guard). */
export class SuspendUserUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  /** Suspend the target user and emit a hash-chained audit row. */
  async execute(input: SuspendUserInput): Promise<AdminUserDTO> {
    if (input.userId === input.actorId) {
      // Custom error code so the Web admin page can pattern-match on the
      // message in 409 responses (see RoleGuard + admin detail page).
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

    await auditService.log({
      action: AUDIT_ADMIN_USER_SUSPENDED,
      actorType: 'user',
      actorId: input.actorId,
      targetType: 'user',
      targetId: String(input.userId),
      metadata: { targetEmail: updated.email, targetRole: updated.role },
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
    });

    return updated;
  }
}
