import { auditService, AUDIT_ADMIN_USER_UNSUSPENDED } from '@shared/audit';
import { notFound } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';

interface UnsuspendUserInput {
  userId: number;
  actorId: number;
  ip?: string;
  requestId?: string;
}

/** Idempotent. */
export class UnsuspendUserUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(input: UnsuspendUserInput): Promise<AdminUserDTO> {
    const updated = await this.repository.unsuspendUser(input.userId);
    if (!updated) {
      throw notFound('User not found');
    }

    await auditService.logActorAction({
      action: AUDIT_ADMIN_USER_UNSUSPENDED,
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
