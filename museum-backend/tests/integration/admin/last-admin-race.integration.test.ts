import { User } from '@modules/auth/domain/user/user.entity';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { Repository } from 'typeorm';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('DERNIER-ADMIN-COURSE [integration, real PG]', () => {
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

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    const { AdminRepositoryPg } =
      await import('@modules/admin/adapters/secondary/pg/admin.repository.pg');
    const { ChangeUserRoleUseCase } =
      await import('@modules/admin/useCase/users/changeUserRole.useCase');
    const { DeleteUserUseCase } = await import('@modules/admin/useCase/users/deleteUser.useCase');
    const { SuspendUserUseCase } = await import('@modules/admin/useCase/users/suspendUser.useCase');
    const { RefreshTokenRepositoryPg } =
      await import('@modules/auth/adapters/secondary/pg/refresh-token.repository.pg');
    const repository = new AdminRepositoryPg(harness.dataSource);
    changeRole = new ChangeUserRoleUseCase(repository);
    deleteUser = new DeleteUserUseCase(
      repository,
      new RefreshTokenRepositoryPg(harness.dataSource),
    );
    suspendUser = new SuspendUserUseCase(repository);
    userRepo = harness.dataSource.getRepository(User);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const seedAdmin = async (email: string): Promise<number> => {
    const saved = await userRepo.save(
      userRepo.create({
        email,
        password: '$2b$12$hashedpassword',
        role: 'admin',
        email_verified: true,
        onboarding_completed: true,
        contentPreferences: [],
      }),
    );
    return saved.id;
  };

  const activePrivileged = async (): Promise<number> =>
    await userRepo
      .createQueryBuilder('u')
      .where("u.role IN ('admin', 'super_admin')")
      .andWhere('u.deleted_at IS NULL')
      .andWhere('u.suspended = false')
      .getCount();

  it('DERNIER-ADMIN-COURSE · deux rétrogradations simultanées des deux seuls admins : une seule passe', async () => {
    const first = await seedAdmin('first@test.dev');
    const second = await seedAdmin('second@test.dev');

    const outcomes = await Promise.allSettled([
      changeRole.execute({ userId: first, newRole: 'visitor', actorId: second }),
      changeRole.execute({ userId: second, newRole: 'visitor', actorId: first }),
    ]);

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((o) => o.status === 'rejected')).toMatchObject({
      reason: { statusCode: 409, code: 'CANNOT_DEMOTE_LAST_ADMIN' },
    });
    expect(await activePrivileged()).toBe(1);
  });

  it('DERNIER-ADMIN-COURSE · une suppression et une rétrogradation simultanées des deux seuls admins : une seule passe', async () => {
    const first = await seedAdmin('first@test.dev');
    const second = await seedAdmin('second@test.dev');

    const outcomes = await Promise.allSettled([
      deleteUser.execute({ userId: first, actorId: second }),
      changeRole.execute({ userId: second, newRole: 'visitor', actorId: first }),
    ]);

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(await activePrivileged()).toBe(1);
  });

  it('DERNIER-ADMIN-COURSE · une suspension et une rétrogradation simultanées des deux seuls admins : une seule passe', async () => {
    const first = await seedAdmin('first@test.dev');
    const second = await seedAdmin('second@test.dev');

    const outcomes = await Promise.allSettled([
      suspendUser.execute({ userId: first, actorId: second }),
      changeRole.execute({ userId: second, newRole: 'visitor', actorId: first }),
    ]);

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(await activePrivileged()).toBe(1);
  });
});
