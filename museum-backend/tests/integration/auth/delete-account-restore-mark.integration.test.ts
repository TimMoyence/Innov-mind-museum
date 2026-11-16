import { makeUser } from 'tests/helpers/auth/user.fixtures';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import { User } from '@modules/auth/domain/user/user.entity';

import type { Repository } from 'typeorm';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('MARQUE-EFFACEMENT [integration, real PG]', () => {
  let harness: IntegrationHarness;
  let userRepo: Repository<User>;
  let adminRepository: InstanceType<
    (typeof import('@modules/admin/adapters/secondary/pg/admin.repository.pg'))['AdminRepositoryPg']
  >;
  let useCaseWith: (
    deleteUser: () => Promise<void>,
    privilegedAccounts?: typeof adminRepository,
  ) => InstanceType<
    (typeof import('@modules/auth/useCase/account/deleteAccount.useCase'))['DeleteAccountUseCase']
  >;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    const { AdminRepositoryPg } =
      await import('@modules/admin/adapters/secondary/pg/admin.repository.pg');
    const { DeleteAccountUseCase } =
      await import('@modules/auth/useCase/account/deleteAccount.useCase');
    const { UserRepositoryPg } =
      await import('@modules/auth/adapters/secondary/pg/user.repository.pg');
    adminRepository = new AdminRepositoryPg(harness.dataSource);
    useCaseWith = (deleteUser, privilegedAccounts = adminRepository) => {
      const userRepository = new UserRepositoryPg(harness.dataSource);
      jest.spyOn(userRepository, 'deleteUser').mockImplementation(deleteUser);
      return new DeleteAccountUseCase({ userRepository, privilegedAccounts });
    };
    userRepo = harness.dataSource.getRepository(User);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const seedVisitor = async (): Promise<number> =>
    (await userRepo.save(makeUser({ id: 1, email: 'visitor@test.dev', role: 'visitor' }))).id;

  it('MARQUE-EFFACEMENT · un compte supprimé par un admin pendant l’effacement reste supprimé après l’échec', async () => {
    const visitor = await seedVisitor();
    const erasure = useCaseWith(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await adminRepository.softDeleteUser(visitor);
      throw new Error('database unavailable');
    });

    await expect(erasure.execute(visitor)).rejects.toThrow('database unavailable');

    expect((await userRepo.findOneBy({ id: visitor }))?.deletedAt).not.toBeNull();
  });

  it('MARQUE-EFFACEMENT · si la restauration échoue aussi, l’erreur d’origine reste celle que voit l’appelant', async () => {
    const visitor = await seedVisitor();
    const failingRestore = Object.assign(Object.create(adminRepository) as typeof adminRepository, {
      restoreUser: jest.fn().mockRejectedValue(new Error('restore unavailable')),
    });
    const erasure = useCaseWith(async () => {
      throw new Error('database unavailable');
    }, failingRestore);

    await expect(erasure.execute(visitor)).rejects.toThrow('database unavailable');
  });
});
