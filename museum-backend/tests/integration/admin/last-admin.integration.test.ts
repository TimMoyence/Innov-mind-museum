import { User } from '@modules/auth/domain/user/user.entity';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { Repository } from 'typeorm';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('DERNIER-ADMIN-ACTIF [integration, real PG]', () => {
  let harness: IntegrationHarness;
  let userRepo: Repository<User>;
  let changeRole: InstanceType<
    (typeof import('@modules/admin/useCase/users/changeUserRole.useCase'))['ChangeUserRoleUseCase']
  >;
  let deleteUser: InstanceType<
    (typeof import('@modules/admin/useCase/users/deleteUser.useCase'))['DeleteUserUseCase']
  >;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    const { AdminRepositoryPg } =
      await import('@modules/admin/adapters/secondary/pg/admin.repository.pg');
    const { ChangeUserRoleUseCase } =
      await import('@modules/admin/useCase/users/changeUserRole.useCase');
    const { DeleteUserUseCase } = await import('@modules/admin/useCase/users/deleteUser.useCase');
    const { RefreshTokenRepositoryPg } =
      await import('@modules/auth/adapters/secondary/pg/refresh-token.repository.pg');
    const repository = new AdminRepositoryPg(harness.dataSource);
    changeRole = new ChangeUserRoleUseCase(repository);
    deleteUser = new DeleteUserUseCase(
      repository,
      new RefreshTokenRepositoryPg(harness.dataSource),
    );
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

  it('DERNIER-ADMIN-ACTIF · un admin supprimé ne protège pas le dernier admin actif d’une rétrogradation', async () => {
    await seedPrivileged('gone@test.dev', 'admin', { deletedAt: new Date() });
    const lastActive = await seedPrivileged('last@test.dev', 'super_admin');

    await expect(
      changeRole.execute({ userId: lastActive, newRole: 'visitor', actorId: lastActive }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CANNOT_DEMOTE_LAST_ADMIN' });
  });

  it('DERNIER-ADMIN-ACTIF · un admin suspendu ne protège pas le dernier admin actif d’une suppression', async () => {
    await seedPrivileged('suspended@test.dev', 'admin', { suspended: true });
    const lastActive = await seedPrivileged('last@test.dev', 'super_admin');

    await expect(
      deleteUser.execute({ userId: lastActive, actorId: lastActive }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CANNOT_DELETE_LAST_ADMIN' });
  });

  it('DERNIER-ADMIN-ACTIF · deux admins actifs : la rétrogradation de l’un passe', async () => {
    await seedPrivileged('other@test.dev', 'admin');
    const target = await seedPrivileged('target@test.dev', 'admin');

    await expect(
      changeRole.execute({ userId: target, newRole: 'visitor', actorId: target }),
    ).resolves.toMatchObject({ role: 'visitor' });
  });
});
