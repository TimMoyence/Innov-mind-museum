import { ChangeUserRoleUseCase } from '@modules/admin/useCase/users/changeUserRole.useCase';

import { makeAdminUserDTO } from '../../../helpers/admin/admin.fixtures';
import { makeAdminRepo } from '../../../helpers/admin/repo.fixtures';

import type { UserRole } from '@modules/auth/domain/user/user-role';

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn(), logActorAction: jest.fn() },
  AUDIT_ADMIN_ROLE_CHANGE: 'ADMIN_ROLE_CHANGE',
}));

const ACTOR = 99;
const TARGET = 5;

const account = (id: number, role: UserRole) =>
  makeAdminUserDTO({ id, email: `user${id}@example.com`, role });

const useCaseWith = (actorRole: UserRole, targetRole: UserRole, newRole: UserRole) => {
  const accounts = new Map([
    [ACTOR, account(ACTOR, actorRole)],
    [TARGET, account(TARGET, targetRole)],
  ]);
  const repo = makeAdminRepo({
    countActiveAccounts: jest.fn().mockResolvedValue(3),
    getUserById: jest.fn((id: number) => Promise.resolve(accounts.get(id) ?? null)),
    changeUserRole: jest.fn().mockResolvedValue(account(TARGET, newRole)),
  });
  return { repo, useCase: new ChangeUserRoleUseCase(repo) };
};

describe('SUPER-ADMIN-SEUL', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each<[string, UserRole, UserRole]>([
    ['nommer un visiteur super_admin', 'visitor', 'super_admin'],
    ['nommer un admin super_admin', 'admin', 'super_admin'],
    ['retirer son rôle à un super_admin', 'super_admin', 'admin'],
  ])(
    'SUPER-ADMIN-SEUL · un admin ne peut pas %s : 403 SUPER_ADMIN_REQUIRED',
    async (_label, targetRole, newRole) => {
      const { repo, useCase } = useCaseWith('admin', targetRole, newRole);

      await expect(
        useCase.execute({ userId: TARGET, newRole, actorId: ACTOR }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'SUPER_ADMIN_REQUIRED' });
      expect(repo.changeUserRole).not.toHaveBeenCalled();
    },
  );

  it.each<[string, UserRole, UserRole]>([
    ['nommer un admin super_admin', 'admin', 'super_admin'],
    ['retirer son rôle à un autre super_admin', 'super_admin', 'admin'],
  ])('SUPER-ADMIN-SEUL · un super_admin peut %s', async (_label, targetRole, newRole) => {
    const { useCase } = useCaseWith('super_admin', targetRole, newRole);

    await expect(
      useCase.execute({ userId: TARGET, newRole, actorId: ACTOR }),
    ).resolves.toMatchObject({ role: newRole });
  });

  it('SUPER-ADMIN-SEUL · un admin garde la main sur les autres rôles', async () => {
    const { useCase } = useCaseWith('admin', 'moderator', 'admin');

    await expect(
      useCase.execute({ userId: TARGET, newRole: 'admin', actorId: ACTOR }),
    ).resolves.toMatchObject({ role: 'admin' });
  });
});
