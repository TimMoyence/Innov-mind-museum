import { makeUser } from 'tests/helpers/auth/user.fixtures';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import { User } from '@modules/auth/domain/user/user.entity';
import { UserRole } from '@modules/auth/domain/user/user-role';

import type { Repository } from 'typeorm';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

const LOCK_WAIT_MS = 2000;

describeIntegration('VERROU-EFFACEMENT [integration, real PG]', () => {
  let harness: IntegrationHarness;
  let userRepo: Repository<User>;
  let adminRepository: InstanceType<
    (typeof import('@modules/admin/adapters/secondary/pg/admin.repository.pg'))['AdminRepositoryPg']
  >;
  let makeUseCase: (
    deleteByPrefix: jest.Mock,
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
    const userRepository = new UserRepositoryPg(harness.dataSource);
    makeUseCase = (deleteByPrefix) =>
      new DeleteAccountUseCase({
        userRepository,
        privilegedAccounts: adminRepository,
        imageStorage: { deleteByPrefix },
      });
    userRepo = harness.dataSource.getRepository(User);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const seed = async (id: number, role: User['role']): Promise<number> => {
    const saved = await userRepo.save(
      makeUser({ id, email: `account-${String(id)}@test.dev`, role }),
    );
    return saved.id;
  };

  const pausedCleanup = () => {
    let release = (): void => undefined;
    let started = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hasStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const deleteByPrefix = jest.fn(async () => {
      started();
      await gate;
    });
    return { deleteByPrefix, hasStarted, release };
  };

  const settlesWithin = async <T>(promise: Promise<T>, ms: number): Promise<T | 'bloqué'> =>
    await Promise.race([
      promise,
      new Promise<'bloqué'>((resolve) => setTimeout(() => resolve('bloqué'), ms)),
    ]);

  it('VERROU-EFFACEMENT · le verrou des comptes privilégiés est libre pendant les nettoyages externes', async () => {
    const visitor = await seed(1, 'visitor');
    const cleanup = pausedCleanup();

    const erasure = makeUseCase(cleanup.deleteByPrefix).execute(visitor);
    await cleanup.hasStarted;
    const lockState = await settlesWithin(
      adminRepository.withPrivilegedAccountsLock(async () => await Promise.resolve('libre')),
      LOCK_WAIT_MS,
    );
    cleanup.release();
    await erasure;

    expect(lockState).toBe('libre');
    expect(await userRepo.findOneBy({ id: visitor })).toBeNull();
  });

  it('VERROU-EFFACEMENT · dès la garde passée, l’admin qui s’efface ne compte plus parmi les comptes actifs', async () => {
    const leaving = await seed(1, 'admin');
    await seed(2, 'admin');
    const cleanup = pausedCleanup();

    const erasure = makeUseCase(cleanup.deleteByPrefix).execute(leaving);
    await cleanup.hasStarted;
    const activeDuringCleanup = await settlesWithin(
      adminRepository.countActiveAccounts([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
      LOCK_WAIT_MS,
    );
    cleanup.release();
    await erasure;

    expect(activeDuringCleanup).toBe(1);
  });

  it('VERROU-EFFACEMENT · un effacement refusé ne lance aucun nettoyage externe', async () => {
    const lastAdmin = await seed(1, 'admin');
    const cleanup = pausedCleanup();

    await expect(makeUseCase(cleanup.deleteByPrefix).execute(lastAdmin)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CANNOT_DELETE_LAST_ADMIN',
    });
    expect(cleanup.deleteByPrefix).not.toHaveBeenCalled();
  });
});
