/**
 * R1 RED — ChangeUserTierUseCase (T1.3).
 *
 * Pins R1 §1 R14/R16/R17 + §3.5 D5 + N3 down BEFORE implementation :
 *  - Valid tier value ('free' | 'premium') → repo.changeUserTier invoked,
 *    audit logged with `{ from, to }` metadata before return.
 *  - Invalid tier ('enterprise', '', undefined, …) → throws 400, audit NOT
 *    emitted, repo NOT called.
 *  - No-op flip (from === to) → returns previous DTO without audit-log spam
 *    (R1 §3.5 D5 idempotent design point).
 *  - Audit log resolved BEFORE the use case returns (N3 — audit ordering).
 *  - User not found → throws 404, audit NOT emitted.
 *  - R17 — tier flip MUST NOT touch sessions_month_count (preserved across
 *    flips). Asserted via repo contract : `changeUserTier(userId, tier)` is
 *    the sole mutation and it does NOT take a counter argument.
 *
 * MUST FAIL at baseline `cd7e22bc` —
 * `@modules/admin/useCase/users/changeUserTier.useCase` does not exist;
 * neither does `AUDIT_ADMIN_USER_TIER_CHANGED` in `@shared/audit`.
 */
import { ChangeUserTierUseCase } from '@modules/admin/useCase/users/changeUserTier.useCase';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';
import { AppError } from '@shared/errors/app.error';

import { makeAdminRepo } from '../../helpers/admin/repo.fixtures';

// R1 §0.3 — module under test imports auditService + the new action constant.
// The mock keeps both observable for assertion. The constant value
// 'ADMIN_USER_TIER_CHANGED' is pinned by Appendix A of R1.md.
jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
  AUDIT_ADMIN_USER_TIER_CHANGED: 'ADMIN_USER_TIER_CHANGED',
}));

import { auditService, AUDIT_ADMIN_USER_TIER_CHANGED } from '@shared/audit';

/**
 * Builds an `AdminUserDTO` extended with the `tier` field that R1 §3.5 D5
 * adds (Appendix A — spec drift). At baseline the DTO doesn't have `tier`
 * yet, so the factory casts via `as unknown as AdminUserDTO` to stay honest
 * w/ TypeScript — the new field surface lands in T2 (green agent).
 * @param overrides - Partial AdminUserDTO+tier overrides.
 * @returns Fully formed AdminUserDTO with the R1 `tier` field applied.
 */
const makeUser = (
  overrides: Partial<AdminUserDTO & { tier: 'free' | 'premium' }> = {},
): AdminUserDTO => {
  const base = {
    id: 1,
    email: 'user@example.com',
    firstname: 'Test',
    lastname: 'User',
    role: 'visitor',
    museumId: null,
    emailVerified: true,
    suspended: false,
    deletedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    tier: 'free' as 'free' | 'premium',
    ...overrides,
  };
  return base as unknown as AdminUserDTO;
};

describe('ChangeUserTierUseCase (R1 §1 R14/R16/R17 + N3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── R14 happy path + audit metadata ──────────────────────────────────

  it('R14: flips free → premium, persists via repo, emits AUDIT_ADMIN_USER_TIER_CHANGED', async () => {
    const previous = makeUser({ id: 5, tier: 'free' });
    const updated = makeUser({ id: 5, tier: 'premium' });
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(previous),
      // R1 §0.3 — new repo method on IAdminRepository (not in baseline).
      changeUserTier: jest.fn().mockResolvedValue(updated),
    } as never);

    const uc = new ChangeUserTierUseCase(repo);
    const result = await uc.execute({
      userId: 5,
      newTier: 'premium',
      actorId: 99,
      ip: '127.0.0.1',
      requestId: 'req-tier-1',
    });

    expect(result).toBe(updated);
    // R17 — single mutation : `changeUserTier(userId, tier)`. Counter NOT
    // touched ; the use case does not pass `sessions_month_count` anywhere.
    const repoSpy = (repo as unknown as { changeUserTier: jest.Mock }).changeUserTier;
    expect(repoSpy).toHaveBeenCalledWith(5, 'premium');
    expect(repoSpy).toHaveBeenCalledTimes(1);

    // R1 §3.5 D5 + N3 — audit row with `{ from, to }` metadata, after the
    // mutation resolves, before the use case returns.
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ADMIN_USER_TIER_CHANGED,
        actorType: 'user',
        actorId: 99,
        targetType: 'user',
        targetId: '5',
        metadata: expect.objectContaining({ from: 'free', to: 'premium' }),
      }),
    );
  });

  // ── R16 invalid tier ─────────────────────────────────────────────────

  it('R16: invalid tier value → 400, audit NOT emitted, repo NOT mutated', async () => {
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(makeUser({ tier: 'free' })),
      changeUserTier: jest.fn().mockResolvedValue(null),
    } as never);
    const uc = new ChangeUserTierUseCase(repo);

    await expect(
      uc.execute({
        userId: 5,
        newTier: 'enterprise' as unknown as 'free' | 'premium',
        actorId: 99,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(auditService.log).not.toHaveBeenCalled();
    const repoSpy = (repo as unknown as { changeUserTier: jest.Mock }).changeUserTier;
    expect(repoSpy).not.toHaveBeenCalled();
  });

  // ── R1 §3.5 D5 — no-op flip ──────────────────────────────────────────

  it('no-op flip (already premium) → returns previous DTO, NO audit, NO repo write', async () => {
    const previous = makeUser({ id: 7, tier: 'premium' });
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(previous),
      changeUserTier: jest.fn().mockResolvedValue(null),
    } as never);
    const uc = new ChangeUserTierUseCase(repo);

    const result = await uc.execute({ userId: 7, newTier: 'premium', actorId: 99 });
    expect(result).toBe(previous);
    expect(auditService.log).not.toHaveBeenCalled();
    const repoSpy = (repo as unknown as { changeUserTier: jest.Mock }).changeUserTier;
    expect(repoSpy).not.toHaveBeenCalled();
  });

  // ── User not found ───────────────────────────────────────────────────

  it('unknown userId → 404, audit NOT emitted', async () => {
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(null),
      changeUserTier: jest.fn().mockResolvedValue(null),
    } as never);
    const uc = new ChangeUserTierUseCase(repo);

    await expect(
      uc.execute({ userId: 999, newTier: 'premium', actorId: 99 }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(auditService.log).not.toHaveBeenCalled();
  });

  // ── N3 — audit ordering ──────────────────────────────────────────────

  it('N3: audit.log resolves BEFORE the use case returns', async () => {
    const previous = makeUser({ id: 11, tier: 'free' });
    const updated = makeUser({ id: 11, tier: 'premium' });
    const order: string[] = [];
    (auditService.log as jest.Mock).mockImplementation(async () => {
      order.push('audit');
    });
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(previous),
      changeUserTier: jest.fn().mockImplementation(async () => {
        order.push('repo');
        return updated;
      }),
    } as never);

    const uc = new ChangeUserTierUseCase(repo);
    await uc.execute({ userId: 11, newTier: 'premium', actorId: 99 });
    order.push('return');

    // R1 §3.5 D5 — audit fires after the mutation, before return (N3).
    expect(order).toEqual(['repo', 'audit', 'return']);
  });

  // ── Defensive — AppError type ────────────────────────────────────────

  it('rejects invalid tier via AppError (not generic Error)', async () => {
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(makeUser({ tier: 'free' })),
    } as never);
    const uc = new ChangeUserTierUseCase(repo);
    await expect(
      uc.execute({
        userId: 5,
        newTier: '' as unknown as 'free' | 'premium',
        actorId: 99,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
