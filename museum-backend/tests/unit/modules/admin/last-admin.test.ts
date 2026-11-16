import { isActiveAccount, refuseRemovingLastAccount } from '@modules/admin/domain/admin/last-admin';

import { makeAdminRepo } from '../../../helpers/admin/repo.fixtures';

import type { AccountRemoval } from '@modules/admin/domain/admin/last-admin';
import type { UserRole } from '@modules/auth/domain/user/user-role';

const account = (
  role: UserRole,
  state: { suspended?: boolean; deletedAt?: string | null } = {},
): { role: UserRole; suspended: boolean; deletedAt: string | null } => ({
  role,
  suspended: state.suspended ?? false,
  deletedAt: state.deletedAt ?? null,
});

const repoWith = (activePrivileged: number, activeSuperAdmins: number) =>
  makeAdminRepo({
    countActiveAccounts: jest.fn((roles: readonly UserRole[]) =>
      Promise.resolve(roles.includes('admin') ? activePrivileged : activeSuperAdmins),
    ),
  });

const REMOVALS: AccountRemoval[] = ['DEMOTE', 'DELETE', 'SUSPEND'];

describe('isActiveAccount', () => {
  it.each([
    ['actif', { suspended: false, deletedAt: null }, true],
    ['suspendu', { suspended: true, deletedAt: null }, false],
    ['supprimé', { suspended: false, deletedAt: '2026-11-16T00:00:00.000Z' }, false],
    ['suspendu et supprimé', { suspended: true, deletedAt: '2026-11-16T00:00:00.000Z' }, false],
  ])('%s → %s', (_label, state, expected) => {
    expect(isActiveAccount(state)).toBe(expected);
  });
});

describe('refuseRemovingLastAccount', () => {
  it.each(REMOVALS)(
    'refuses %s of the last active admin with 409 CANNOT_<removal>_LAST_ADMIN',
    async (removal) => {
      const code = `CANNOT_${removal}_LAST_ADMIN`;

      await expect(
        refuseRemovingLastAccount(repoWith(1, 0), account('admin'), removal, 'visitor'),
      ).rejects.toMatchObject({ statusCode: 409, code, message: code });
    },
  );

  it.each(REMOVALS)(
    'refuses %s of the last active super_admin while admins remain with 409 CANNOT_<removal>_LAST_SUPER_ADMIN',
    async (removal) => {
      const code = `CANNOT_${removal}_LAST_SUPER_ADMIN`;

      await expect(
        refuseRemovingLastAccount(repoWith(3, 1), account('super_admin'), removal, 'admin'),
      ).rejects.toMatchObject({ statusCode: 409, code });
    },
  );

  it('names the admin tier first when the last super_admin is also the last privileged account', async () => {
    await expect(
      refuseRemovingLastAccount(repoWith(1, 1), account('super_admin'), 'DELETE'),
    ).rejects.toMatchObject({ code: 'CANNOT_DELETE_LAST_ADMIN' });
  });

  it('refuses when the count is already 0', async () => {
    await expect(
      refuseRemovingLastAccount(repoWith(0, 0), account('admin'), 'DELETE'),
    ).rejects.toMatchObject({ code: 'CANNOT_DELETE_LAST_ADMIN' });
  });

  it.each<[UserRole, UserRole, number, number]>([
    ['admin', 'visitor', 2, 0],
    ['super_admin', 'admin', 3, 2],
    ['super_admin', 'visitor', 2, 2],
  ])(
    'lets %s become %s when another account of each left tier stays active',
    async (role, keptRole, privileged, supers) => {
      await expect(
        refuseRemovingLastAccount(repoWith(privileged, supers), account(role), 'DEMOTE', keptRole),
      ).resolves.toBeUndefined();
    },
  );

  it.each<[UserRole, UserRole]>([
    ['super_admin', 'super_admin'],
    ['admin', 'super_admin'],
    ['admin', 'admin'],
  ])('never counts when %s keeps every tier it is in (→ %s)', async (role, keptRole) => {
    const repo = repoWith(1, 1);

    await expect(
      refuseRemovingLastAccount(repo, account(role), 'DEMOTE', keptRole),
    ).resolves.toBeUndefined();
    expect(repo.countActiveAccounts).not.toHaveBeenCalled();
  });

  it.each([
    ['moderator', account('moderator')],
    ['visitor', account('visitor')],
    ['admin suspendu', account('admin', { suspended: true })],
    ['super_admin supprimé', account('super_admin', { deletedAt: '2026-11-16T00:00:00.000Z' })],
  ])(
    'never refuses nor counts for a target outside every active tier (%s)',
    async (_label, target) => {
      const repo = repoWith(1, 1);

      await expect(refuseRemovingLastAccount(repo, target, 'DELETE')).resolves.toBeUndefined();
      expect(repo.countActiveAccounts).not.toHaveBeenCalled();
    },
  );
});
