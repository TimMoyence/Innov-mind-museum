import { makeUser } from 'tests/helpers/auth/user.fixtures';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import { User } from '@modules/auth/domain/user/user.entity';

import type { Repository } from 'typeorm';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('EFFACEMENT-ECHOUE [integration, real PG]', () => {
  let harness: IntegrationHarness;
  let userRepo: Repository<User>;
  let failingErasure: InstanceType<
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
    const userRepository = new UserRepositoryPg(harness.dataSource);
    jest.spyOn(userRepository, 'deleteUser').mockRejectedValue(new Error('database unavailable'));
    failingErasure = new DeleteAccountUseCase({
      userRepository,
      privilegedAccounts: new AdminRepositoryPg(harness.dataSource),
    });
    userRepo = harness.dataSource.getRepository(User);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const seed = async (id: number, deletedAt: Date | null = null): Promise<number> => {
    const saved = await userRepo.save(
      makeUser({ id, email: `account-${String(id)}@test.dev`, role: 'visitor', deletedAt }),
    );
    return saved.id;
  };

  it('EFFACEMENT-ECHOUE · si la suppression de la ligne échoue, le compte reste actif et l’effacement peut être relancé', async () => {
    const visitor = await seed(1);

    await expect(failingErasure.execute(visitor)).rejects.toThrow('database unavailable');

    expect((await userRepo.findOneBy({ id: visitor }))?.deletedAt).toBeNull();
  });

  it('EFFACEMENT-ECHOUE · un compte déjà supprimé par un admin reste supprimé après un effacement échoué', async () => {
    const deletedAt = new Date('2026-11-01T00:00:00.000Z');
    const removed = await seed(1, deletedAt);

    await expect(failingErasure.execute(removed)).rejects.toThrow('database unavailable');

    expect((await userRepo.findOneBy({ id: removed }))?.deletedAt).toEqual(deletedAt);
  });
});
