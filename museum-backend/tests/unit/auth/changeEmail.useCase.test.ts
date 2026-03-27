import bcrypt from 'bcrypt';
import { ChangeEmailUseCase } from '@modules/auth/core/useCase/changeEmail.useCase';
import { ConfirmEmailChangeUseCase } from '@modules/auth/core/useCase/confirmEmailChange.useCase';
import type { IUserRepository } from '@modules/auth/core/domain/user.repository.interface';
import type { User } from '@modules/auth/core/domain/user.entity';
import type { EmailService } from '@shared/email/email.port';

jest.mock('bcrypt', () => ({
  ...jest.requireActual('bcrypt'),
  compare: jest.fn(),
}));

const HASHED_PASSWORD = '$2b$12$existinghash';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    email: 'user@test.com',
    password: HASHED_PASSWORD,
    firstname: 'Test',
    lastname: 'User',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;

const makeUserRepo = (user: User | null = makeUser()) =>
  ({
    getUserById: jest.fn().mockResolvedValue(user),
    getUserByEmail: jest.fn().mockResolvedValue(null),
    setEmailChangeToken: jest.fn().mockResolvedValue(undefined),
    consumeEmailChangeToken: jest.fn().mockResolvedValue(user),
  }) as unknown as jest.Mocked<
    Pick<
      IUserRepository,
      'getUserById' | 'getUserByEmail' | 'setEmailChangeToken' | 'consumeEmailChangeToken'
    >
  >;

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
    const useCase = new ChangeEmailUseCase(
      repo as unknown as IUserRepository,
      emailService,
      'https://app.musaium.com',
    );

    const token = await useCase.execute(1, 'new@test.com', 'ValidPass1');

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBe(64); // 32 bytes hex
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
  });

  it('rejects wrong current password', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
    const repo = makeUserRepo();
    const useCase = new ChangeEmailUseCase(repo as unknown as IUserRepository);

    await expect(useCase.execute(1, 'new@test.com', 'wrongPass')).rejects.toMatchObject({
      message: 'Current password is incorrect',
      statusCode: 400,
    });
  });

  it('rejects social-only account (no password)', async () => {
    const repo = makeUserRepo(makeUser({ password: null }));
    const useCase = new ChangeEmailUseCase(repo as unknown as IUserRepository);

    await expect(useCase.execute(1, 'new@test.com', 'anything')).rejects.toMatchObject({
      message: 'Cannot change email for social-only accounts',
      statusCode: 400,
    });
  });

  it('throws 404 for non-existent user', async () => {
    const repo = makeUserRepo(null);
    const useCase = new ChangeEmailUseCase(repo as unknown as IUserRepository);

    await expect(useCase.execute(999, 'new@test.com', 'pass')).rejects.toMatchObject({
      message: 'User not found',
      statusCode: 404,
    });
  });

  it('rejects same email as current', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const repo = makeUserRepo(makeUser({ email: 'same@test.com' }));
    const useCase = new ChangeEmailUseCase(repo as unknown as IUserRepository);

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
    const useCase = new ChangeEmailUseCase(repo as unknown as IUserRepository);

    await expect(useCase.execute(1, 'taken@test.com', 'ValidPass1')).rejects.toMatchObject({
      message: 'This email is already in use',
      statusCode: 400,
    });
  });

  it('rejects invalid email format', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const repo = makeUserRepo();
    const useCase = new ChangeEmailUseCase(repo as unknown as IUserRepository);

    await expect(useCase.execute(1, 'not-an-email', 'ValidPass1')).rejects.toMatchObject({
      message: 'Invalid email format',
      statusCode: 400,
    });
  });

  it('normalizes email to lowercase and trimmed', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const repo = makeUserRepo();
    const useCase = new ChangeEmailUseCase(repo as unknown as IUserRepository);

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
    const useCase = new ChangeEmailUseCase(
      repo as unknown as IUserRepository,
      emailService,
      'https://app.musaium.com',
    );

    const token = await useCase.execute(1, 'new@test.com', 'ValidPass1');

    expect(token).toBeDefined();
    expect(repo.setEmailChangeToken).toHaveBeenCalled();
  });

  it('sets token expiration roughly 1 hour in the future', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const repo = makeUserRepo();
    const useCase = new ChangeEmailUseCase(repo as unknown as IUserRepository);

    const before = Date.now();
    await useCase.execute(1, 'new@test.com', 'ValidPass1');
    const after = Date.now();

    const expiresArg = (repo.setEmailChangeToken as jest.Mock).mock.calls[0][3] as Date;
    expect(expiresArg.getTime()).toBeGreaterThanOrEqual(before + 3600000 - 100);
    expect(expiresArg.getTime()).toBeLessThanOrEqual(after + 3600000 + 100);
  });
});

describe('ConfirmEmailChangeUseCase', () => {
  it('confirms email change with valid token', async () => {
    const updatedUser = makeUser({ email: 'new@test.com' });
    const repo = makeUserRepo(updatedUser);
    const useCase = new ConfirmEmailChangeUseCase(repo as unknown as IUserRepository);

    const result = await useCase.execute('abcd1234');

    expect(result).toEqual({ confirmed: true });
    expect(repo.consumeEmailChangeToken).toHaveBeenCalledWith(expect.any(String));
  });

  it('rejects invalid or expired token', async () => {
    const repo = makeUserRepo();
    (repo.consumeEmailChangeToken as jest.Mock).mockResolvedValueOnce(null);
    const useCase = new ConfirmEmailChangeUseCase(repo as unknown as IUserRepository);

    await expect(useCase.execute('invalid-token')).rejects.toMatchObject({
      message: 'Invalid or expired email change token',
      statusCode: 400,
    });
  });

  it('rejects empty token', async () => {
    const repo = makeUserRepo();
    const useCase = new ConfirmEmailChangeUseCase(repo as unknown as IUserRepository);

    await expect(useCase.execute('   ')).rejects.toMatchObject({
      message: 'Email change token is required',
      statusCode: 400,
    });
  });
});
