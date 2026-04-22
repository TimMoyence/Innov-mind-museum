import crypto from 'node:crypto';

import bcrypt from 'bcrypt';
import { ResetPasswordUseCase } from '@modules/auth/useCase/resetPassword.useCase';
import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';
import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeRefreshTokenRepo, makeUserRepo } from '../../helpers/auth/user-repo.mock';

jest.mock('bcrypt', () => ({
  ...jest.requireActual('bcrypt'),
  hash: jest.fn(),
}));

const mockHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;

describe('ResetPasswordUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHash.mockResolvedValue('$2b$12$hashedNewPassword' as never);
  });

  // ── Happy path ───────────────────────────────────────────────────

  it('resets password with a valid token and valid password', async () => {
    const repo = makeUserRepo(makeUser());
    const useCase = new ResetPasswordUseCase(repo, makeRefreshTokenRepo());

    const result = await useCase.execute('valid-reset-token', 'NewValid1');

    expect(result).toMatchObject({ id: 1, email: 'user@test.com' });
    expect(mockHash).toHaveBeenCalledWith('NewValid1', BCRYPT_ROUNDS);
    const expectedHashedToken = crypto
      .createHash('sha256')
      .update('valid-reset-token')
      .digest('hex');
    expect(repo.consumeResetTokenAndUpdatePassword).toHaveBeenCalledWith(
      expectedHashedToken,
      '$2b$12$hashedNewPassword',
    );
  });

  it('passes hashed password to repo, never plaintext', async () => {
    const repo = makeUserRepo(makeUser());
    const useCase = new ResetPasswordUseCase(repo, makeRefreshTokenRepo());

    await useCase.execute('token', 'SecurePass1');

    const repoArg = repo.consumeResetTokenAndUpdatePassword.mock.calls[0][1];
    expect(repoArg).toBe('$2b$12$hashedNewPassword');
    expect(repoArg).not.toBe('SecurePass1');
  });

  it('uses BCRYPT_ROUNDS constant for hashing', async () => {
    const repo = makeUserRepo(makeUser());
    const useCase = new ResetPasswordUseCase(repo, makeRefreshTokenRepo());

    await useCase.execute('token', 'SecurePass1');

    expect(mockHash).toHaveBeenCalledWith('SecurePass1', BCRYPT_ROUNDS);
    expect(BCRYPT_ROUNDS).toBe(12);
  });

  // ── Password validation errors ──────────────────────────────────

  it('throws 400 for password too short (< 8 chars)', async () => {
    const repo = makeUserRepo(makeUser());
    const useCase = new ResetPasswordUseCase(repo, makeRefreshTokenRepo());

    await expect(useCase.execute('token', 'Ab1')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('at least 8'),
    });
    expect(repo.consumeResetTokenAndUpdatePassword).not.toHaveBeenCalled();
  });

  it('throws 400 for password without uppercase letter', async () => {
    const repo = makeUserRepo(makeUser());
    const useCase = new ResetPasswordUseCase(repo, makeRefreshTokenRepo());

    await expect(useCase.execute('token', 'lowercase1')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('uppercase'),
    });
  });

  it('throws 400 for password without lowercase letter', async () => {
    const repo = makeUserRepo(makeUser());
    const useCase = new ResetPasswordUseCase(repo, makeRefreshTokenRepo());

    await expect(useCase.execute('token', 'UPPERCASE1')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('lowercase'),
    });
  });

  it('throws 400 for password without digit', async () => {
    const repo = makeUserRepo(makeUser());
    const useCase = new ResetPasswordUseCase(repo, makeRefreshTokenRepo());

    await expect(useCase.execute('token', 'NoDigitHere')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('digit'),
    });
  });

  it('throws 400 for password too long (> 128 chars)', async () => {
    const repo = makeUserRepo(makeUser());
    const useCase = new ResetPasswordUseCase(repo, makeRefreshTokenRepo());
    const longPassword = 'Aa1' + 'x'.repeat(126);

    await expect(useCase.execute('token', longPassword)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('at most 128'),
    });
  });

  // ── Invalid/expired token ────────────────────────────────────────

  it('throws 400 when token is invalid or expired', async () => {
    const repo = makeUserRepo(null);
    const useCase = new ResetPasswordUseCase(repo, makeRefreshTokenRepo());

    await expect(useCase.execute('expired-token', 'ValidPass1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid or expired reset token',
    });
  });

  it('does not call bcrypt.hash when password validation fails', async () => {
    const repo = makeUserRepo(makeUser());
    const useCase = new ResetPasswordUseCase(repo, makeRefreshTokenRepo());

    await expect(useCase.execute('token', 'weak')).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(mockHash).not.toHaveBeenCalled();
  });
});
