import { UserRole } from '@modules/auth/domain/user/user-role';
import { auditService, AUDIT_ADMIN_USER_DELETED } from '@shared/audit';
import { AppError, notFound } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';
import type { IRefreshTokenRepository } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';

/** Input for the delete-user admin use case. */
interface DeleteUserInput {
  userId: number;
  actorId: number;
  ip?: string;
  requestId?: string;
}

/**
 * Soft-deletes a user (`deleted_at = NOW()`) and revokes every active refresh
 * token. Hard erasure (RGPD Art. 17 full erase) deferred V1.1 (ADR-050).
 *
 * Guards:
 *   - Refuse if the target is the last admin / super_admin (last-privileged guard).
 *   - Self-delete is *permitted* on purpose: a super_admin asking to wipe their
 *     own account hits the last-admin guard if alone, and is otherwise valid
 *     (matches the existing user-side `deleteAccount.useCase` semantics).
 */
export class DeleteUserUseCase {
  constructor(
    private readonly repository: IAdminRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
  ) {}

  /** Soft-delete + token revocation + audit. */
  async execute(input: DeleteUserInput): Promise<AdminUserDTO> {
    // We need to know the target role BEFORE deleting so we can guard the
    // last-privileged-user case. Fetch first.
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
      // Race condition: row vanished between the two queries. Rare; surface 404.
      throw notFound('User not found');
    }

    await this.refreshTokenRepository.revokeAllForUser(input.userId);

    await auditService.log({
      action: AUDIT_ADMIN_USER_DELETED,
      actorType: 'user',
      actorId: input.actorId,
      targetType: 'user',
      targetId: String(input.userId),
      metadata: { targetEmail: deleted.email, targetRole: deleted.role },
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
    });

    return deleted;
  }
}
