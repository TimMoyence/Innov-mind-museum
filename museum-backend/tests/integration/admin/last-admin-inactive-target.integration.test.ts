import { User } from '@modules/auth/domain/user/user.entity';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { Repository } from 'typeorm';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('CIBLE-INACTIVE [integration, real PG]', () => {
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

  const seedPrivileged = async (
    email: string,
    role: 'admin' | 'super_admin',
    state: Partial<Pick<User, 'deletedAt' | 'suspended'>> = {},
  ): Promise<number> => {
    const saved = await userRepo.save(
      userRepo.create({
        email,
        password: '$2b$12$hashedpassword',
        role,
        email_verified: true,
        onboarding_completed: true,
        contentPreferences: [],
        ...state,
      }),
    );
    return saved.id;
  };

  it('CIBLE-INACTIVE · un admin suspendu se supprime tant qu’un autre admin reste actif', async () => {
    const active = await seedPrivileged('active@test.dev', 'super_admin');
    const suspended = await seedPrivileged('suspended@test.dev', 'admin', { suspended: true });

    await expect(deleteUser.execute({ userId: suspended, actorId: active })).resolves.toMatchObject(
      { deletedAt: expect.any(String) },
    );
  });

  it('CIBLE-INACTIVE · un admin supprimé se rétrograde tant qu’un autre admin reste actif', async () => {
    const active = await seedPrivileged('active@test.dev', 'super_admin');
    const deleted = await seedPrivileged('deleted@test.dev', 'admin', { deletedAt: new Date() });

    await expect(
      changeRole.execute({ userId: deleted, newRole: 'visitor', actorId: active }),
    ).resolves.toMatchObject({ role: 'visitor' });
  });

  it('CIBLE-INACTIVE · un admin déjà suspendu se suspend encore sans refus', async () => {
    const active = await seedPrivileged('active@test.dev', 'super_admin');
    const suspended = await seedPrivileged('suspended@test.dev', 'admin', { suspended: true });

    await expect(
      suspendUser.execute({ userId: suspended, actorId: active }),
    ).resolves.toMatchObject({ suspended: true });
  });
});
