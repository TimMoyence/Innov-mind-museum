import { User } from '@modules/auth/domain/user/user.entity';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import type { Repository } from 'typeorm';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('EFFACEMENT-DERNIER-ADMIN [integration, real PG]', () => {
  let harness: IntegrationHarness;
  let userRepo: Repository<User>;
  let deleteAccount: InstanceType<
    (typeof import('@modules/auth/useCase/account/deleteAccount.useCase'))['DeleteAccountUseCase']
  >;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    const { DeleteAccountUseCase } =
      await import('@modules/auth/useCase/account/deleteAccount.useCase');
    const { UserRepositoryPg } =
      await import('@modules/auth/adapters/secondary/pg/user.repository.pg');
    const { AdminRepositoryPg } =
      await import('@modules/admin/adapters/secondary/pg/admin.repository.pg');
    const options = {
      userRepository: new UserRepositoryPg(harness.dataSource),
      privilegedAccounts: new AdminRepositoryPg(harness.dataSource),
    };
    deleteAccount = new DeleteAccountUseCase(options);
    userRepo = harness.dataSource.getRepository(User);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const seed = async (email: string, role: User['role']): Promise<number> => {
    const saved = await userRepo.save(
      userRepo.create({
        email,
        password: '$2b$12$hashedpassword',
        role,
        email_verified: true,
        onboarding_completed: true,
        contentPreferences: [],
      }),
    );
    return saved.id;
  };

  it('EFFACEMENT-DERNIER-ADMIN · le dernier admin actif ne peut pas effacer son compte : 409 CANNOT_DELETE_LAST_ADMIN, compte intact', async () => {
    const lastAdmin = await seed('last@test.dev', 'super_admin');

    await expect(deleteAccount.execute(lastAdmin)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CANNOT_DELETE_LAST_ADMIN',
    });
    await expect(userRepo.existsBy({ id: lastAdmin })).resolves.toBe(true);
  });

  it('EFFACEMENT-DERNIER-ADMIN · un admin efface son compte tant qu’un autre admin reste actif', async () => {
    await seed('other@test.dev', 'admin');
    const admin = await seed('leaving@test.dev', 'admin');

    await expect(deleteAccount.execute(admin)).resolves.toBeUndefined();
    await expect(userRepo.existsBy({ id: admin })).resolves.toBe(false);
  });

  it('EFFACEMENT-DERNIER-ADMIN · un visiteur efface son compte même sans autre admin', async () => {
    const visitor = await seed('visitor@test.dev', 'visitor');

    await expect(deleteAccount.execute(visitor)).resolves.toBeUndefined();
    await expect(userRepo.existsBy({ id: visitor })).resolves.toBe(false);
  });
});
