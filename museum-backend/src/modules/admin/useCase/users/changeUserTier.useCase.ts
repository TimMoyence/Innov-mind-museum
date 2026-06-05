import { UserTier } from '@modules/auth/domain/user/user-tier';
import { auditService, AUDIT_ADMIN_USER_TIER_CHANGED } from '@shared/audit';
import { badRequest, notFound } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';

/** R1 §3.5 D5 */
interface ChangeUserTierInput {
  userId: number;
  newTier: 'free' | 'premium';
  actorId: number;
  ip?: string;
  requestId?: string;
}

/**
 * R1 (C6) — Admin tier override. validate → mutate → audit → return.
 * - Idempotent no-op when previous.tier === newTier (R1 §3.5 D5) — no audit, no write.
 * - Audit emitted AFTER mutation, BEFORE return (N3 audit ordering).
 * - MUST NOT touch the monthly counter (R17 — handled by repo).
 */
export class ChangeUserTierUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(input: ChangeUserTierInput): Promise<AdminUserDTO> {
    const validTiers: string[] = Object.values(UserTier);
    if (!validTiers.includes(input.newTier)) {
      throw badRequest(`Invalid tier. Must be one of: ${validTiers.join(', ')}`);
    }

    const previous = await this.repository.getUserById(input.userId);
    if (!previous) {
      throw notFound('User not found');
    }

    // R1 §3.5 D5 — no-op skip prevents double-click audit chain inflation.
    if (previous.tier === input.newTier) {
      return previous;
    }

    const updated = await this.repository.changeUserTier(input.userId, input.newTier);
    if (!updated) {
      throw notFound('User not found');
    }

    await auditService.logActorAction({
      action: AUDIT_ADMIN_USER_TIER_CHANGED,
      actorId: input.actorId,
      targetType: 'user',
      targetId: String(input.userId),
      metadata: { from: previous.tier, to: input.newTier },
      ip: input.ip,
      requestId: input.requestId,
    });

    return updated;
  }
}
