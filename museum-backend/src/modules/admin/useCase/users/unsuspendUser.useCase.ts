import { auditService, AUDIT_ADMIN_USER_UNSUSPENDED } from '@shared/audit';
import { notFound } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';

/** Input for the unsuspend-user admin use case. */
interface UnsuspendUserInput {
  userId: number;
  actorId: number;
  ip?: string;
  requestId?: string;
}

/** Set users.suspended=false. Idempotent. */
export class UnsuspendUserUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  /** Unsuspend the target user and emit a hash-chained audit row. */
  async execute(input: UnsuspendUserInput): Promise<AdminUserDTO> {
    const updated = await this.repository.unsuspendUser(input.userId);
    if (!updated) {
      throw notFound('User not found');
    }

    await auditService.log({
      action: AUDIT_ADMIN_USER_UNSUSPENDED,
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
