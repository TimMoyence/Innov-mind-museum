import { ChangeUserTierUseCase } from '@modules/admin/useCase/users/changeUserTier.useCase';
import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';
import { AppError } from '@shared/errors/app.error';

import { makeAdminRepo } from '../../helpers/admin/repo.fixtures';

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn(), logActorAction: jest.fn() },
  AUDIT_ADMIN_USER_TIER_CHANGED: 'ADMIN_USER_TIER_CHANGED',
}));

import { auditService, AUDIT_ADMIN_USER_TIER_CHANGED } from '@shared/audit';

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

  it('R14: flips free → premium, persists via repo, emits AUDIT_ADMIN_USER_TIER_CHANGED', async () => {
    const previous = makeUser({ id: 5, tier: 'free' });
    const updated = makeUser({ id: 5, tier: 'premium' });
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(previous),
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
    const repoSpy = (repo as unknown as { changeUserTier: jest.Mock }).changeUserTier;
    expect(repoSpy).toHaveBeenCalledWith(5, 'premium');
    expect(repoSpy).toHaveBeenCalledTimes(1);

    expect(auditService.logActorAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ADMIN_USER_TIER_CHANGED,
        actorId: 99,
        targetType: 'user',
        targetId: '5',
        metadata: expect.objectContaining({ from: 'free', to: 'premium' }),
      }),
    );
  });

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

    expect(auditService.logActorAction).not.toHaveBeenCalled();
    const repoSpy = (repo as unknown as { changeUserTier: jest.Mock }).changeUserTier;
    expect(repoSpy).not.toHaveBeenCalled();
  });

  it('no-op flip (already premium) → returns previous DTO, NO audit, NO repo write', async () => {
    const previous = makeUser({ id: 7, tier: 'premium' });
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(previous),
      changeUserTier: jest.fn().mockResolvedValue(null),
    } as never);
    const uc = new ChangeUserTierUseCase(repo);

    const result = await uc.execute({ userId: 7, newTier: 'premium', actorId: 99 });
    expect(result).toBe(previous);
    expect(auditService.logActorAction).not.toHaveBeenCalled();
    const repoSpy = (repo as unknown as { changeUserTier: jest.Mock }).changeUserTier;
    expect(repoSpy).not.toHaveBeenCalled();
  });

  it('unknown userId → 404, audit NOT emitted', async () => {
    const repo = makeAdminRepo({
      getUserById: jest.fn().mockResolvedValue(null),
      changeUserTier: jest.fn().mockResolvedValue(null),
    } as never);
    const uc = new ChangeUserTierUseCase(repo);

    await expect(
      uc.execute({ userId: 999, newTier: 'premium', actorId: 99 }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(auditService.logActorAction).not.toHaveBeenCalled();
  });

  it('N3: audit.log resolves BEFORE the use case returns', async () => {
    const previous = makeUser({ id: 11, tier: 'free' });
    const updated = makeUser({ id: 11, tier: 'premium' });
    const order: string[] = [];
    (auditService.logActorAction as jest.Mock).mockImplementation(async () => {
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

    expect(order).toEqual(['repo', 'audit', 'return']);
  });

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
