import { ChangeUserRoleUseCase } from '@modules/admin/useCase/users/changeUserRole.useCase';

import { makeAdminUserDTO } from '../../../helpers/admin/admin.fixtures';
import { makeAdminRepo } from '../../../helpers/admin/repo.fixtures';

import type { AdminUserDTO } from '@modules/admin/domain/admin/admin.types';

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn(), logActorAction: jest.fn() },
  AUDIT_ADMIN_ROLE_CHANGE: 'ADMIN_ROLE_CHANGE',
}));

const ACTOR = 99;
const TARGET = 5;

const useCaseWith = (actor: Partial<AdminUserDTO>) => {
  const accounts = new Map([
    [ACTOR, makeAdminUserDTO({ id: ACTOR, role: 'super_admin', ...actor })],
    [TARGET, makeAdminUserDTO({ id: TARGET, role: 'admin' })],
  ]);
  const repo = makeAdminRepo({
    countActiveAccounts: jest.fn().mockResolvedValue(3),
    getUserById: jest.fn((id: number) => Promise.resolve(accounts.get(id) ?? null)),
    changeUserRole: jest
      .fn()
      .mockResolvedValue(makeAdminUserDTO({ id: TARGET, role: 'super_admin' })),
  });
  return { repo, useCase: new ChangeUserRoleUseCase(repo) };
};

describe('SUPER-ADMIN-ACTIF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['suspendu', { suspended: true }],
    ['supprimé', { deletedAt: '2026-11-16T00:00:00.000Z' }],
  ])(
    'SUPER-ADMIN-ACTIF · un super_admin %s dont le jeton vit encore ne peut pas nommer un super_admin : 403 SUPER_ADMIN_REQUIRED',
    async (_label, state) => {
      const { repo, useCase } = useCaseWith(state);

      await expect(
        useCase.execute({ userId: TARGET, newRole: 'super_admin', actorId: ACTOR }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'SUPER_ADMIN_REQUIRED' });
      expect(repo.changeUserRole).not.toHaveBeenCalled();
    },
  );

  it('SUPER-ADMIN-ACTIF · un super_admin actif nomme un super_admin', async () => {
    const { repo, useCase } = useCaseWith({});

    await useCase.execute({ userId: TARGET, newRole: 'super_admin', actorId: ACTOR });

    expect(repo.changeUserRole).toHaveBeenCalledWith(TARGET, 'super_admin');
  });
});
