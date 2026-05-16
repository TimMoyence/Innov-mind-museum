import { UserTier } from '@modules/auth/domain/user/user-tier';
import { auditService, AUDIT_ADMIN_USER_TIER_CHANGED } from '@shared/audit';
import { badRequest, notFound } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';

/** Input for the change-user-tier use case (R1 §3.5 D5). */
interface ChangeUserTierInput {
  userId: number;
  newTier: 'free' | 'premium';
  actorId: number;
  ip?: string;
  requestId?: string;
}

/**
 * R1 (C6) — Admin tier override use case. Mirrors `ChangeUserRoleUseCase`
 * shape (validate → mutate → audit → return) but :
 *  - Uses `changeUserTier` repo method (single UPDATE, RETURNING DTO).
 *  - Emits `AUDIT_ADMIN_USER_TIER_CHANGED` with `{ from, to }` metadata
 *    AFTER the mutation, BEFORE returning (N3 audit ordering).
 *  - Idempotent no-op when `previous.tier === newTier` (R1 §3.5 D5) — no
 *    audit row, no repo write.
 *  - No "last admin" invariant (no equivalent for tier).
 *  - MUST NOT touch the monthly counter (R17 — handled by the repo).
 */
export class ChangeUserTierUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  /** Validates + flips the user's tier, emitting the audit row on success. */
  async execute(input: ChangeUserTierInput): Promise<AdminUserDTO> {
    const validTiers: string[] = Object.values(UserTier);
    if (!validTiers.includes(input.newTier)) {
      throw badRequest(`Invalid tier. Must be one of: ${validTiers.join(', ')}`);
    }

    const previous = await this.repository.getUserById(input.userId);
    if (!previous) {
      throw notFound('User not found');
    }

    // R1 §3.5 D5 — no-op skip. Returning the existing DTO without an audit
    // row keeps double-clicks from inflating the chain ; the user state is
    // unchanged from the admin's perspective.
    if (previous.tier === input.newTier) {
      return previous;
    }

    const updated = await this.repository.changeUserTier(input.userId, input.newTier);
    if (!updated) {
      throw notFound('User not found');
    }

    await auditService.log({
      action: AUDIT_ADMIN_USER_TIER_CHANGED,
      actorType: 'user',
      actorId: input.actorId,
      targetType: 'user',
      targetId: String(input.userId),
      metadata: { from: previous.tier, to: input.newTier },
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
    });

    return updated;
  }
}
