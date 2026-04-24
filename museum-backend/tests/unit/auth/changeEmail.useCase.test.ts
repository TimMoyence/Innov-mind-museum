import bcrypt from 'bcrypt';
import { ChangeEmailUseCase } from '@modules/auth/useCase/changeEmail.useCase';
import { ConfirmEmailChangeUseCase } from '@modules/auth/useCase/confirmEmailChange.useCase';
import type { User } from '@modules/auth/domain/user.entity';
import type { EmailService } from '@shared/email/email.port';
import { makeUser } from '../../helpers/auth/user.fixtures';
import {
  makeRefreshTokenRepo,
  makeUserRepo as makeUserRepoBase,
} from '../../helpers/auth/user-repo.mock';

jest.mock('bcrypt', () => ({
  ...jest.requireActual('bcrypt'),
  compare: jest.fn(),
}));

/**
 * Wraps the shared factory: getUserByEmail defaults to null (email not taken).
 * @param user
 */
const makeUserRepo = (user: User | null = makeUser()) =>
  makeUserRepoBase(user, {
    getUserByEmail: jest.fn().mockResolvedValue(null),
  });

const makeEmailService = (): jest.Mocked<EmailService> => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
});

describe('ChangeEmailUseCase', () => {
  beforeEach(() => {
    (bcrypt.compare as jest.Mock).mockReset();
  });

  it('sends confirmation email and stores hashed token on success', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const repo = makeUserRepo();
    const emailService = makeEmailService();
    const useCase = new ChangeEmailUseCase(repo, emailService, 'https://app.musaium.com');

    const token = await useCase.execute(1, 'new@test.com', 'ValidPass1');

    expect(token).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
    expect(repo.getUserById).toHaveBeenCalledWith(1);
    expect(repo.getUserByEmail).toHaveBeenCalledWith('new@test.com');
    expect(repo.setEmailChangeToken).toHaveBeenCalledWith(
      1,
      expect.any(String), // hashed token
      'new@test.com',
      expect.any(Date),
    );
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'new@test.com',
      'Confirm your Musaium email change',
      expect.stringContaining(token),
    );
    // Default locale 'fr' is prepended to the confirmation URL
    const htmlArg = emailService.sendEmail.mock.calls[0][2];
    expect(htmlArg).toContain('https://app.musaium.com/fr/confirm-email-change?token=' + token);
  });

  it('builds confirmation URL with "en" locale when requested', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const repo = makeUserRepo();
    const emailService = makeEmailService();
    const useCase = new ChangeEmailUseCase(repo, emailService, 'https://app.musaium.com');

    const token = await useCase.execute(1, 'new@test.com', 'ValidPass1', 'en');

    const htmlArg = emailService.sendEmail.mock.calls[0][2];
    expect(htmlArg).toContain('https://app.musaium.com/en/confirm-email-change?token=' + token);
    expect(htmlArg).not.toContain('/fr/confirm-email-change');
  });

  it('rejects wrong current password', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
    const repo = makeUserRepo();
    const useCase = new ChangeEmailUseCase(repo);

    await expect(useCase.execute(1, 'new@test.com', 'wrongPass')).rejects.toMatchObject({
      message: 'Current password is incorrect',
      statusCode: 400,
    });
  });

  it('rejects social-only account (no password)', async () => {
    const repo = makeUserRepo(makeUser({ password: null }));
    const useCase = new ChangeEmailUseCase(repo);

    await expect(useCase.execute(1, 'new@test.com', 'anything')).rejects.toMatchObject({
      message: 'Cannot change email for social-only accounts',
      statusCode: 400,
    });
  });

  it('throws 404 for non-existent user', async () => {
    const repo = makeUserRepo(null);
    const useCase = new ChangeEmailUseCase(repo);

    await expect(useCase.execute(999, 'new@test.com', 'pass')).rejects.toMatchObject({
      message: 'User not found',
      statusCode: 404,
    });
  });

  it('rejects same email as current', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const repo = makeUserRepo(makeUser({ email: 'same@test.com' }));
    const useCase = new ChangeEmailUseCase(repo);

    await expect(useCase.execute(1, 'same@test.com', 'ValidPass1')).rejects.toMatchObject({
      message: 'New email must be different from current email',
      statusCode: 400,
    });
  });

  it('rejects email already in use by another user', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const repo = makeUserRepo();
    (repo.getUserByEmail as jest.Mock).mockResolvedValueOnce(
      makeUser({ id: 2, email: 'taken@test.com' }),
    );
    const useCase = new ChangeEmailUseCase(repo);

    await expect(useCase.execute(1, 'taken@test.com', 'ValidPass1')).rejects.toMatchObject({
      message: 'This email is already in use',
      statusCode: 400,
    });
  });

  it('rejects invalid email format', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const repo = makeUserRepo();
    const useCase = new ChangeEmailUseCase(repo);

    await expect(useCase.execute(1, 'not-an-email', 'ValidPass1')).rejects.toMatchObject({
      message: 'Invalid email format',
      statusCode: 400,
    });
  });

  it('normalizes email to lowercase and trimmed', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const repo = makeUserRepo();
    const useCase = new ChangeEmailUseCase(repo);

    await useCase.execute(1, '  NEW@Test.COM  ', 'ValidPass1');

    expect(repo.getUserByEmail).toHaveBeenCalledWith('new@test.com');
    expect(repo.setEmailChangeToken).toHaveBeenCalledWith(
      1,
      expect.any(String),
      'new@test.com',
      expect.any(Date),
    );
  });

  it('does not throw when emailService.sendEmail fails — warns instead', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const repo = makeUserRepo();
    const emailService = makeEmailService();
    emailService.sendEmail.mockRejectedValue(new Error('SMTP timeout'));
    const useCase = new ChangeEmailUseCase(repo, emailService, 'https://app.musaium.com');

    const token = await useCase.execute(1, 'new@test.com', 'ValidPass1');

    expect(token).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
    expect(repo.setEmailChangeToken).toHaveBeenCalled();
  });

  it('sets token expiration roughly 1 hour in the future', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const repo = makeUserRepo();
    const useCase = new ChangeEmailUseCase(repo);

    const before = Date.now();
    await useCase.execute(1, 'new@test.com', 'ValidPass1');
    const after = Date.now();

    const expiresArg = (repo.setEmailChangeToken as jest.Mock).mock.calls[0][3] as Date;
    expect(expiresArg.getTime()).toBeGreaterThanOrEqual(before + 3600000 - 100);
    expect(expiresArg.getTime()).toBeLessThanOrEqual(after + 3600000 + 100);
  });
});

describe('ConfirmEmailChangeUseCase', () => {
  it('confirms email change and revokes refresh tokens with valid token', async () => {
    const updatedUser = makeUser({ id: 42, email: 'new@test.com' });
    const repo = makeUserRepo(updatedUser);
    const refreshTokenRepo = makeRefreshTokenRepo();
    const useCase = new ConfirmEmailChangeUseCase(repo, refreshTokenRepo);

    const result = await useCase.execute('abcd1234');

    expect(result).toEqual({ confirmed: true });
    expect(repo.consumeEmailChangeToken).toHaveBeenCalledWith(expect.any(String));
    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(42);
  });

  it('rejects invalid or expired token', async () => {
    const repo = makeUserRepo();
    (repo.consumeEmailChangeToken as jest.Mock).mockResolvedValueOnce(null);
    const refreshTokenRepo = makeRefreshTokenRepo();
    const useCase = new ConfirmEmailChangeUseCase(repo, refreshTokenRepo);

    await expect(useCase.execute('invalid-token')).rejects.toMatchObject({
      message: 'Invalid or expired email change token',
      statusCode: 400,
    });
    expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('rejects empty token', async () => {
    const repo = makeUserRepo();
    const refreshTokenRepo = makeRefreshTokenRepo();
    const useCase = new ConfirmEmailChangeUseCase(repo, refreshTokenRepo);

    await expect(useCase.execute('   ')).rejects.toMatchObject({
      message: 'Email change token is required',
      statusCode: 400,
    });
    expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
  });
});
