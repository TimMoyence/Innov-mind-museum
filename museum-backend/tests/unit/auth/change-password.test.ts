import bcrypt from 'bcrypt';
import { ChangePasswordUseCase } from '@modules/auth/useCase/password/changePassword.useCase';
import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo, makeRefreshTokenRepo } from '../../helpers/auth/user-repo.mock';

jest.mock('bcrypt', () => ({
  ...jest.requireActual('bcrypt'),
  compare: jest.fn(),
}));

describe('ChangePasswordUseCase', () => {
  beforeEach(() => {
    (bcrypt.compare as jest.Mock).mockReset();
  });

  it('rejects wrong current password', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
    const repo = makeUserRepo(makeUser());
    const useCase = new ChangePasswordUseCase(repo, makeRefreshTokenRepo());

    await expect(useCase.execute(1, 'wrongPass1', 'NewValid1')).rejects.toMatchObject({
      message: 'Current password is incorrect',
      statusCode: 400,
    });
  });

  it('rejects same-as-current new password', async () => {
    (bcrypt.compare as jest.Mock)
      .mockResolvedValueOnce(true) // current password matches
      .mockResolvedValueOnce(true); // new password is same
    const repo = makeUserRepo(makeUser());
    const useCase = new ChangePasswordUseCase(repo, makeRefreshTokenRepo());

    await expect(useCase.execute(1, 'OldPass1', 'OldPass1')).rejects.toMatchObject({
      message: 'New password must be different from current password',
      statusCode: 400,
    });
  });

  it('rejects weak new password', async () => {
    (bcrypt.compare as jest.Mock)
      .mockResolvedValueOnce(true) // current password matches
      .mockResolvedValueOnce(false); // new password is different
    const repo = makeUserRepo(makeUser());
    const useCase = new ChangePasswordUseCase(repo, makeRefreshTokenRepo());

    await expect(useCase.execute(1, 'OldPass1', 'weak')).rejects.toMatchObject({
      message: expect.stringContaining('Password must be'),
      statusCode: 400,
    });
  });

  it('rejects social-only account (no password)', async () => {
    const repo = makeUserRepo(makeUser({ password: null }));
    const useCase = new ChangePasswordUseCase(repo, makeRefreshTokenRepo());

    await expect(useCase.execute(1, 'anything', 'NewValid1')).rejects.toMatchObject({
      message: 'Cannot change password for social-only accounts',
      statusCode: 400,
    });
  });

  it('updates password and revokes all tokens on success', async () => {
    (bcrypt.compare as jest.Mock)
      .mockResolvedValueOnce(true) // current password matches
      .mockResolvedValueOnce(false); // new password is different
    const repo = makeUserRepo(makeUser());
    const refreshRepo = makeRefreshTokenRepo();
    const useCase = new ChangePasswordUseCase(repo, refreshRepo);

    await useCase.execute(1, 'OldPass1', 'NewValid1');

    expect(repo.updatePassword).toHaveBeenCalledWith(1, 'NewValid1');
    expect(refreshRepo.revokeAllForUser).toHaveBeenCalledWith(1);
  });

  it('throws 404 for non-existent user', async () => {
    const repo = makeUserRepo(null);
    const useCase = new ChangePasswordUseCase(repo, makeRefreshTokenRepo());

    await expect(useCase.execute(999, 'pass', 'NewValid1')).rejects.toMatchObject({
      message: 'User not found',
      statusCode: 404,
    });
  });
});
