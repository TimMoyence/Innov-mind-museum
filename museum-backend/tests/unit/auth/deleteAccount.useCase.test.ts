import { DeleteAccountUseCase, ImageCleanupPort } from '@modules/auth/core/useCase/deleteAccount.useCase';
import type { IUserRepository } from '@modules/auth/core/domain/user.repository.interface';
import type { User } from '@modules/auth/core/domain/user.entity';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    email: 'user@test.com',
    password: '$2b$12$hash',
    firstname: 'Test',
    lastname: 'User',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;

const makeUserRepo = (user: User | null = makeUser()) => ({
  getUserById: jest.fn().mockResolvedValue(user),
  deleteUser: jest.fn().mockResolvedValue(undefined),
});

const makeImageStorage = (): jest.Mocked<ImageCleanupPort> => ({
  deleteByPrefix: jest.fn().mockResolvedValue(undefined),
});

describe('DeleteAccountUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Happy paths ──────────────────────────────────────────────────

  it('deletes user and cleans up images when imageStorage is provided', async () => {
    const repo = makeUserRepo();
    const imageStorage = makeImageStorage();
    const useCase = new DeleteAccountUseCase(repo as unknown as IUserRepository, imageStorage);

    await useCase.execute(1);

    expect(repo.getUserById).toHaveBeenCalledWith(1);
    expect(imageStorage.deleteByPrefix).toHaveBeenCalledWith('user-1');
    expect(repo.deleteUser).toHaveBeenCalledWith(1);
  });

  it('deletes user without image cleanup when imageStorage is not provided', async () => {
    const repo = makeUserRepo();
    const useCase = new DeleteAccountUseCase(repo as unknown as IUserRepository);

    await useCase.execute(1);

    expect(repo.getUserById).toHaveBeenCalledWith(1);
    expect(repo.deleteUser).toHaveBeenCalledWith(1);
  });

  // ── Error paths ──────────────────────────────────────────────────

  it('throws 404 when user does not exist', async () => {
    const repo = makeUserRepo(null);
    const useCase = new DeleteAccountUseCase(repo as unknown as IUserRepository);

    await expect(useCase.execute(999)).rejects.toMatchObject({
      message: 'User not found',
      statusCode: 404,
    });

    expect(repo.deleteUser).not.toHaveBeenCalled();
  });

  // ── Edge cases (RGPD resilience) ─────────────────────────────────

  it('continues deletion when imageStorage.deleteByPrefix fails (RGPD resilience)', async () => {
    const repo = makeUserRepo();
    const imageStorage = makeImageStorage();
    imageStorage.deleteByPrefix.mockRejectedValue(new Error('S3 connection timeout'));
    const useCase = new DeleteAccountUseCase(repo as unknown as IUserRepository, imageStorage);

    // Should NOT throw
    await useCase.execute(1);

    expect(imageStorage.deleteByPrefix).toHaveBeenCalledWith('user-1');
    // User must still be deleted even if images fail
    expect(repo.deleteUser).toHaveBeenCalledWith(1);
  });

  it('calls deleteByPrefix before deleteUser (images before user)', async () => {
    const repo = makeUserRepo();
    const imageStorage = makeImageStorage();
    const callOrder: string[] = [];

    imageStorage.deleteByPrefix.mockImplementation(async () => {
      callOrder.push('deleteByPrefix');
    });
    repo.deleteUser.mockImplementation(async () => {
      callOrder.push('deleteUser');
    });

    const useCase = new DeleteAccountUseCase(repo as unknown as IUserRepository, imageStorage);

    await useCase.execute(1);

    expect(callOrder).toEqual(['deleteByPrefix', 'deleteUser']);
  });

  it('uses correct prefix format "user-{userId}"', async () => {
    const repo = makeUserRepo(makeUser({ id: 42 }));
    const imageStorage = makeImageStorage();
    const useCase = new DeleteAccountUseCase(repo as unknown as IUserRepository, imageStorage);

    await useCase.execute(42);

    expect(imageStorage.deleteByPrefix).toHaveBeenCalledWith('user-42');
  });

  it('does not call deleteUser when getUserById throws', async () => {
    const repo = makeUserRepo();
    repo.getUserById.mockRejectedValue(new Error('DB connection lost'));
    const useCase = new DeleteAccountUseCase(repo as unknown as IUserRepository);

    await expect(useCase.execute(1)).rejects.toThrow('DB connection lost');
    expect(repo.deleteUser).not.toHaveBeenCalled();
  });
});
