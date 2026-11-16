import { makeUser } from 'tests/helpers/auth/user.fixtures';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import { User } from '@modules/auth/domain/user/user.entity';

import type { Repository } from 'typeorm';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('DERNIER-SUPER-ADMIN [integration, real PG]', () => {
  let harness: IntegrationHarness;
  let userRepo: Repository<User>;
  let changeRole: InstanceType<
    (typeof import('@modules/admin/useCase/users/changeUserRole.useCase'))['ChangeUserRoleUseCase']
  >;
  let deleteUser: InstanceType<
    (typeof import('@modules/admin/useCase/users/deleteUser.useCase'))['DeleteUserUseCase']
  >;
  let suspendUser: InstanceType<
    (typeof import('@modules/admin/useCase/users/suspendUser.useCase'))['SuspendUserUseCase']
  >;
  let deleteAccount: InstanceType<
    (typeof import('@modules/auth/useCase/account/deleteAccount.useCase'))['DeleteAccountUseCase']
  >;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    const { AdminRepositoryPg } =
      await import('@modules/admin/adapters/secondary/pg/admin.repository.pg');
    const { ChangeUserRoleUseCase } =
      await import('@modules/admin/useCase/users/changeUserRole.useCase');
    const { DeleteUserUseCase } = await import('@modules/admin/useCase/users/deleteUser.useCase');
    const { SuspendUserUseCase } = await import('@modules/admin/useCase/users/suspendUser.useCase');
    const { DeleteAccountUseCase } =
      await import('@modules/auth/useCase/account/deleteAccount.useCase');
    const { UserRepositoryPg } =
      await import('@modules/auth/adapters/secondary/pg/user.repository.pg');
    const { RefreshTokenRepositoryPg } =
      await import('@modules/auth/adapters/secondary/pg/refresh-token.repository.pg');
    const repository = new AdminRepositoryPg(harness.dataSource);
    changeRole = new ChangeUserRoleUseCase(repository);
    deleteUser = new DeleteUserUseCase(
      repository,
      new RefreshTokenRepositoryPg(harness.dataSource),
    );
    suspendUser = new SuspendUserUseCase(repository);
    deleteAccount = new DeleteAccountUseCase({
      userRepository: new UserRepositoryPg(harness.dataSource),
      privilegedAccounts: repository,
    });
    userRepo = harness.dataSource.getRepository(User);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const seed = async (id: number, role: User['role'], suspended = false): Promise<number> => {
    const saved = await userRepo.save(
      makeUser({ id, email: `account-${String(id)}@test.dev`, role, suspended }),
    );
    return saved.id;
  };

  const roleOf = async (id: number): Promise<string | undefined> =>
    (await userRepo.findOneBy({ id }))?.role;

  const activeCount = async (roles: string[]): Promise<number> =>
    await userRepo
      .createQueryBuilder('u')
      .where('u.role IN (:...roles)', { roles })
      .andWhere('u.deleted_at IS NULL')
      .andWhere('u.suspended = false')
      .getCount();

  it('DERNIER-SUPER-ADMIN · le dernier super_admin actif ne peut pas se rétrograder en admin : 409 CANNOT_DEMOTE_LAST_SUPER_ADMIN', async () => {
    const owner = await seed(1, 'super_admin');
    await seed(2, 'admin');

    await expect(
      changeRole.execute({ userId: owner, newRole: 'admin', actorId: owner }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CANNOT_DEMOTE_LAST_SUPER_ADMIN' });
    expect(await roleOf(owner)).toBe('super_admin');
  });

  it('DERNIER-SUPER-ADMIN · un super_admin rétrograde un autre super_admin tant qu’il en reste un', async () => {
    const owner = await seed(1, 'super_admin');
    const other = await seed(2, 'super_admin');

    await changeRole.execute({ userId: other, newRole: 'admin', actorId: owner });

    expect(await roleOf(other)).toBe('admin');
  });

  it('DERNIER-SUPER-ADMIN · un super_admin suspendu ne compte pas : le seul super_admin actif reste protégé', async () => {
    const owner = await seed(1, 'super_admin');
    await seed(2, 'super_admin', true);
    await seed(3, 'admin');

    await expect(
      changeRole.execute({ userId: owner, newRole: 'visitor', actorId: owner }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CANNOT_DEMOTE_LAST_SUPER_ADMIN' });
  });

  it('DERNIER-SUPER-ADMIN · supprimer le dernier super_admin actif : 409 CANNOT_DELETE_LAST_SUPER_ADMIN', async () => {
    const owner = await seed(1, 'super_admin');
    const admin = await seed(2, 'admin');

    await expect(deleteUser.execute({ userId: owner, actorId: admin })).rejects.toMatchObject({
      statusCode: 409,
      code: 'CANNOT_DELETE_LAST_SUPER_ADMIN',
    });
    expect(await activeCount(['super_admin'])).toBe(1);
  });

  it('DERNIER-SUPER-ADMIN · suspendre le dernier super_admin actif : 409 CANNOT_SUSPEND_LAST_SUPER_ADMIN', async () => {
    const owner = await seed(1, 'super_admin');
    const admin = await seed(2, 'admin');

    await expect(suspendUser.execute({ userId: owner, actorId: admin })).rejects.toMatchObject({
      statusCode: 409,
      code: 'CANNOT_SUSPEND_LAST_SUPER_ADMIN',
    });
    expect(await activeCount(['super_admin'])).toBe(1);
  });

  it('DERNIER-SUPER-ADMIN · le dernier super_admin actif ne peut pas effacer son compte : 409 CANNOT_DELETE_LAST_SUPER_ADMIN, compte intact', async () => {
    const owner = await seed(1, 'super_admin');
    await seed(2, 'admin');

    await expect(deleteAccount.execute(owner)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CANNOT_DELETE_LAST_SUPER_ADMIN',
    });
    expect(await roleOf(owner)).toBe('super_admin');
  });

  it('DERNIER-SUPER-ADMIN · deux super_admin qui se rétrogradent eux-mêmes en même temps : un seul passe', async () => {
    const first = await seed(1, 'super_admin');
    const second = await seed(2, 'super_admin');

    const outcomes = await Promise.allSettled([
      changeRole.execute({ userId: first, newRole: 'admin', actorId: first }),
      changeRole.execute({ userId: second, newRole: 'admin', actorId: second }),
    ]);

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((o) => o.status === 'rejected')).toMatchObject({
      reason: { statusCode: 409, code: 'CANNOT_DEMOTE_LAST_SUPER_ADMIN' },
    });
    expect(await activeCount(['super_admin'])).toBe(1);
  });

  it('DERNIER-SUPER-ADMIN · un effacement de compte et une rétrogradation simultanés des deux seuls admins : un seul passe', async () => {
    const first = await seed(1, 'admin');
    const second = await seed(2, 'admin');

    const outcomes = await Promise.allSettled([
      deleteAccount.execute(first),
      changeRole.execute({ userId: second, newRole: 'visitor', actorId: first }),
    ]);

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(await activeCount(['admin', 'super_admin'])).toBe(1);
  });
});
