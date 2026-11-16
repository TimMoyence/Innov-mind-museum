import {
  DeleteAccountUseCase,
  ImageCleanupPort,
} from '@modules/auth/useCase/account/deleteAccount.useCase';
import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';
import { makeAdminRepo } from 'tests/helpers/admin/repo.fixtures';
import { makeAdminUserDTO } from 'tests/helpers/admin/admin.fixtures';
import { logger } from '@shared/logger/logger';

const makeImageStorage = (): jest.Mocked<ImageCleanupPort> => ({
  deleteByPrefix: jest.fn().mockResolvedValue(undefined),
});

describe('DeleteAccountUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes user and cleans up images when imageStorage is provided', async () => {
    const repo = makeUserRepo(makeUser());
    const imageStorage = makeImageStorage();
    const useCase = new DeleteAccountUseCase({
      userRepository: repo,
      privilegedAccounts: makeAdminRepo(),
      imageStorage,
    });

    await useCase.execute(1);

    expect(repo.getUserById).toHaveBeenCalledWith(1);
    expect(imageStorage.deleteByPrefix).toHaveBeenCalledWith(1, undefined);
    expect(repo.deleteUser).toHaveBeenCalledWith(1);
  });

  it('deletes user without image cleanup when imageStorage is not provided', async () => {
    const repo = makeUserRepo(makeUser());
    const useCase = new DeleteAccountUseCase({
      userRepository: repo,
      privilegedAccounts: makeAdminRepo(),
    });

    await useCase.execute(1);

    expect(repo.getUserById).toHaveBeenCalledWith(1);
    expect(repo.deleteUser).toHaveBeenCalledWith(1);
  });

  it('throws 404 when user does not exist', async () => {
    const repo = makeUserRepo(null);
    const useCase = new DeleteAccountUseCase({
      userRepository: repo,
      privilegedAccounts: makeAdminRepo(),
    });

    await expect(useCase.execute(999)).rejects.toMatchObject({
      message: 'User not found',
      statusCode: 404,
    });

    expect(repo.deleteUser).not.toHaveBeenCalled();
  });

  it('continues deletion when imageStorage.deleteByPrefix fails (RGPD resilience)', async () => {
    const repo = makeUserRepo(makeUser());
    const imageStorage = makeImageStorage();
    imageStorage.deleteByPrefix.mockRejectedValue(new Error('S3 connection timeout'));
    const useCase = new DeleteAccountUseCase({
      userRepository: repo,
      privilegedAccounts: makeAdminRepo(),
      imageStorage,
    });

    await useCase.execute(1);

    expect(imageStorage.deleteByPrefix).toHaveBeenCalledWith(1, undefined);
    expect(repo.deleteUser).toHaveBeenCalledWith(1);
  });

  it('calls deleteByPrefix before deleteUser (images before user)', async () => {
    const repo = makeUserRepo(makeUser());
    const imageStorage = makeImageStorage();
    const callOrder: string[] = [];

    imageStorage.deleteByPrefix.mockImplementation(async () => {
      callOrder.push('deleteByPrefix');
    });
    repo.deleteUser.mockImplementation(async () => {
      callOrder.push('deleteUser');
    });

    const useCase = new DeleteAccountUseCase({
      userRepository: repo,
      privilegedAccounts: makeAdminRepo(),
      imageStorage,
    });

    await useCase.execute(1);

    expect(callOrder).toEqual(['deleteByPrefix', 'deleteUser']);
  });

  it('passes the numeric userId through to deleteByPrefix', async () => {
    const repo = makeUserRepo(makeUser({ id: 42 }));
    const imageStorage = makeImageStorage();
    const useCase = new DeleteAccountUseCase({
      userRepository: repo,
      privilegedAccounts: makeAdminRepo(),
      imageStorage,
    });

    await useCase.execute(42);

    expect(imageStorage.deleteByPrefix).toHaveBeenCalledWith(42, undefined);
  });

  it('does not call deleteUser when getUserById throws', async () => {
    const repo = makeUserRepo(makeUser());
    repo.getUserById.mockRejectedValue(new Error('DB connection lost'));
    const useCase = new DeleteAccountUseCase({
      userRepository: repo,
      privilegedAccounts: makeAdminRepo(),
    });

    await expect(useCase.execute(1)).rejects.toThrow('DB connection lost');
    expect(repo.deleteUser).not.toHaveBeenCalled();
  });

  describe('when the final deletion fails after the erasure mark', () => {
    const MARK = '2026-11-16T10:00:00.000Z';

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const markedErasure = (restoreUser: jest.Mock, deletedBefore: string | null = null) => {
      const repo = makeUserRepo(makeUser());
      repo.deleteUser.mockRejectedValue(new Error('database unavailable'));
      const privilegedAccounts = makeAdminRepo({
        getUserById: jest.fn().mockResolvedValue(makeAdminUserDTO({ deletedAt: deletedBefore })),
        softDeleteUser: jest.fn().mockResolvedValue(makeAdminUserDTO({ deletedAt: MARK })),
        restoreUser,
      });
      return new DeleteAccountUseCase({ userRepository: repo, privilegedAccounts });
    };

    it('never restores an account that was already deleted before the erasure', async () => {
      const restoreUser = jest.fn().mockResolvedValue(undefined);

      await expect(
        markedErasure(restoreUser, '2026-11-01T00:00:00.000Z').execute(1),
      ).rejects.toThrow('database unavailable');
      expect(restoreUser).not.toHaveBeenCalled();
    });

    it('removes exactly the mark it set, then rethrows the original error', async () => {
      const restoreUser = jest.fn().mockResolvedValue(undefined);

      await expect(markedErasure(restoreUser).execute(1)).rejects.toThrow('database unavailable');
      expect(restoreUser).toHaveBeenCalledWith(1, MARK);
    });

    it('logs delete_account_mark_restore_failed when removing the mark fails too', async () => {
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
      const restoreUser = jest.fn().mockRejectedValue(new Error('restore unavailable'));

      await expect(markedErasure(restoreUser).execute(1)).rejects.toThrow('database unavailable');
      expect(errorSpy).toHaveBeenCalledWith('delete_account_mark_restore_failed', {
        userId: 1,
        error: 'restore unavailable',
      });
    });
  });
});
