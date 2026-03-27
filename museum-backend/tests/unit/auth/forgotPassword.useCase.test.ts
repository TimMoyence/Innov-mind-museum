import { ForgotPasswordUseCase } from '@modules/auth/core/useCase/forgotPassword.useCase';
import type { IUserRepository } from '@modules/auth/core/domain/user.repository.interface';
import type { User } from '@modules/auth/core/domain/user.entity';
import type { EmailService } from '@shared/email/email.port';

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
  getUserByEmail: jest.fn().mockResolvedValue(user),
  setResetToken: jest.fn().mockResolvedValue(user),
});

const makeEmailService = (): jest.Mocked<EmailService> => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
});

describe('ForgotPasswordUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Happy paths ──────────────────────────────────────────────────

  it('generates token, stores it, and sends email when user exists and email service is configured', async () => {
    const repo = makeUserRepo();
    const emailService = makeEmailService();
    const useCase = new ForgotPasswordUseCase(
      repo as unknown as IUserRepository,
      emailService,
      'https://app.musaium.com',
    );

    const token = await useCase.execute('user@test.com');

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token!.length).toBe(40); // 20 bytes hex
    expect(repo.getUserByEmail).toHaveBeenCalledWith('user@test.com');
    expect(repo.setResetToken).toHaveBeenCalledWith('user@test.com', token, expect.any(Date));
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'user@test.com',
      'Reset your Musaium password',
      expect.stringContaining(token!),
    );
  });

  it('generates token and logs when no email service is configured', async () => {
    const repo = makeUserRepo();
    const useCase = new ForgotPasswordUseCase(repo as unknown as IUserRepository);

    const token = await useCase.execute('user@test.com');

    expect(token).toBeDefined();
    expect(repo.setResetToken).toHaveBeenCalled();
    // No email service, so sendEmail should not have been called at all
  });

  it('sets token expiration roughly 1 hour in the future', async () => {
    const repo = makeUserRepo();
    const useCase = new ForgotPasswordUseCase(repo as unknown as IUserRepository);

    const before = Date.now();
    await useCase.execute('user@test.com');
    const after = Date.now();

    const expiresArg = repo.setResetToken.mock.calls[0][2] as Date;
    // Expiration should be ~1h from now
    expect(expiresArg.getTime()).toBeGreaterThanOrEqual(before + 3600000 - 100);
    expect(expiresArg.getTime()).toBeLessThanOrEqual(after + 3600000 + 100);
  });

  // ── Anti-enumeration ─────────────────────────────────────────────

  it('returns undefined silently when user does not exist (anti-enumeration)', async () => {
    const repo = makeUserRepo(null);
    const emailService = makeEmailService();
    const useCase = new ForgotPasswordUseCase(
      repo as unknown as IUserRepository,
      emailService,
      'https://app.musaium.com',
    );

    const result = await useCase.execute('nonexistent@test.com');

    expect(result).toBeUndefined();
    expect(repo.setResetToken).not.toHaveBeenCalled();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  // ── Edge cases ───────────────────────────────────────────────────

  it('returns undefined for empty email string', async () => {
    const repo = makeUserRepo();
    const useCase = new ForgotPasswordUseCase(repo as unknown as IUserRepository);

    const result = await useCase.execute('');

    expect(result).toBeUndefined();
    expect(repo.getUserByEmail).not.toHaveBeenCalled();
  });

  it('returns undefined for whitespace-only email', async () => {
    const repo = makeUserRepo();
    const useCase = new ForgotPasswordUseCase(repo as unknown as IUserRepository);

    const result = await useCase.execute('   ');

    expect(result).toBeUndefined();
    expect(repo.getUserByEmail).not.toHaveBeenCalled();
  });

  it('returns undefined for null-ish email', async () => {
    const repo = makeUserRepo();
    const useCase = new ForgotPasswordUseCase(repo as unknown as IUserRepository);

    const result = await useCase.execute(undefined as unknown as string);

    expect(result).toBeUndefined();
    expect(repo.getUserByEmail).not.toHaveBeenCalled();
  });

  it('does not throw when emailService.sendEmail fails — warns instead', async () => {
    const repo = makeUserRepo();
    const emailService = makeEmailService();
    emailService.sendEmail.mockRejectedValue(new Error('SMTP timeout'));
    const useCase = new ForgotPasswordUseCase(
      repo as unknown as IUserRepository,
      emailService,
      'https://app.musaium.com',
    );

    // Should not throw
    const token = await useCase.execute('user@test.com');

    expect(token).toBeDefined();
    expect(repo.setResetToken).toHaveBeenCalled();
  });

  it('normalizes email to lowercase and trimmed', async () => {
    const repo = makeUserRepo();
    const useCase = new ForgotPasswordUseCase(repo as unknown as IUserRepository);

    await useCase.execute('  User@Test.COM  ');

    expect(repo.getUserByEmail).toHaveBeenCalledWith('user@test.com');
  });

  it('includes reset link with frontendUrl in email HTML', async () => {
    const repo = makeUserRepo();
    const emailService = makeEmailService();
    const useCase = new ForgotPasswordUseCase(
      repo as unknown as IUserRepository,
      emailService,
      'https://my-app.com',
    );

    const token = await useCase.execute('user@test.com');

    const htmlArg = emailService.sendEmail.mock.calls[0][2];
    expect(htmlArg).toContain('https://my-app.com/reset-password?token=' + token);
  });

  it('generates unique tokens on successive calls', async () => {
    const repo = makeUserRepo();
    const useCase = new ForgotPasswordUseCase(repo as unknown as IUserRepository);

    const token1 = await useCase.execute('user@test.com');
    const token2 = await useCase.execute('user@test.com');

    expect(token1).not.toEqual(token2);
  });
});
