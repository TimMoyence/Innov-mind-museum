jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@src/config/env', () => ({
  env: {
    nodeEnv: 'test',
    auth: {
      passwordBreachCheckEnabled: false,
    },
  },
}));

import crypto from 'node:crypto';

import { RegisterUseCase } from '@modules/auth/useCase/registration/register.useCase';
import { makeUser } from 'tests/helpers/auth/user.fixtures';
import { makeUserRepo } from 'tests/helpers/auth/user-repo.mock';

import type { EmailService } from '@shared/email/email.port';

const makeMockEmailService = (): jest.Mocked<EmailService> => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
});

describe('RegisterUseCase', () => {
  it('registers a user with valid email and password', async () => {
    const registeredUser = makeUser({ id: 10, email: 'newuser@test.com' });
    const userRepo = makeUserRepo(null, {
      registerUser: jest.fn().mockResolvedValue(registeredUser),
    });

    const useCase = new RegisterUseCase(userRepo);
    const result = await useCase.execute('newuser@test.com', 'StrongP@ss1!');

    expect(result.id).toBe(10);
    expect(result.email).toBe('newuser@test.com');
    expect(userRepo.registerUser).toHaveBeenCalledTimes(1);
    expect(userRepo.registerUser).toHaveBeenCalledWith(
      'newuser@test.com',
      'StrongP@ss1!',
      undefined,
      undefined,
    );
  });

  it('normalizes email to lowercase and trimmed', async () => {
    const registeredUser = makeUser({ email: 'user@test.com' });
    const userRepo = makeUserRepo(null, {
      registerUser: jest.fn().mockResolvedValue(registeredUser),
    });

    const useCase = new RegisterUseCase(userRepo);
    await useCase.execute('  User@Test.COM  ', 'StrongP@ss1!');

    expect(userRepo.registerUser).toHaveBeenCalledWith(
      'user@test.com',
      expect.anything(),
      undefined,
      undefined,
    );
  });

  it('rejects invalid email format', async () => {
    const userRepo = makeUserRepo();
    const useCase = new RegisterUseCase(userRepo);

    await expect(useCase.execute('not-an-email', 'StrongP@ss1!')).rejects.toThrow('Invalid email');
  });

  it('rejects weak password', async () => {
    const userRepo = makeUserRepo();
    const useCase = new RegisterUseCase(userRepo);

    await expect(useCase.execute('user@test.com', '123')).rejects.toThrow();
  });

  it('passes sanitized name fields to the repository', async () => {
    const registeredUser = makeUser({ firstname: 'Jane', lastname: 'Doe' });
    const userRepo = makeUserRepo(null, {
      registerUser: jest.fn().mockResolvedValue(registeredUser),
    });

    const useCase = new RegisterUseCase(userRepo);
    await useCase.execute('user@test.com', 'StrongP@ss1!', 'Jane', 'Doe');

    expect(userRepo.registerUser).toHaveBeenCalledWith(
      'user@test.com',
      'StrongP@ss1!',
      'Jane',
      'Doe',
    );
  });

  it('stores a SHA-256 hash of the verification token (SEC H2)', async () => {
    const registeredUser = makeUser({ id: 5 });
    const userRepo = makeUserRepo(null, {
      registerUser: jest.fn().mockResolvedValue(registeredUser),
    });
    const emailService = makeMockEmailService();

    const useCase = new RegisterUseCase(userRepo, emailService, 'https://app.example.com');
    await useCase.execute('user@test.com', 'StrongP@ss1!');

    expect(userRepo.setVerificationToken).toHaveBeenCalledTimes(1);
    const [userId, storedToken, expires] = userRepo.setVerificationToken.mock.calls[0];
    expect(userId).toBe(5);
    expect(storedToken).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex digest
    expect(expires).toBeInstanceOf(Date);

    // Extract the raw token from the email link and verify the DB got the hash, not the raw token.
    const htmlArg = emailService.sendEmail.mock.calls[0][2];
    const match = /token=([a-f0-9]+)/.exec(htmlArg);
    expect(match).not.toBeNull();
    const rawToken = match![1];
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    expect(storedToken).toBe(expectedHash);
    expect(storedToken).not.toBe(rawToken);
  });

  it('sends a verification email when email service is configured', async () => {
    const registeredUser = makeUser({ id: 5 });
    const userRepo = makeUserRepo(null, {
      registerUser: jest.fn().mockResolvedValue(registeredUser),
    });
    const emailService = makeMockEmailService();

    const useCase = new RegisterUseCase(userRepo, emailService, 'https://app.example.com');
    await useCase.execute('user@test.com', 'StrongP@ss1!');

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'user@test.com',
      expect.stringContaining('Verify'),
      expect.stringContaining('verify-email'),
    );
    // Default locale 'fr' is prepended to the verification URL
    const htmlArg = emailService.sendEmail.mock.calls[0][2];
    expect(htmlArg).toContain('https://app.example.com/fr/verify-email?token=');
  });

  it('builds verification URL with "en" locale when requested', async () => {
    const registeredUser = makeUser({ id: 6 });
    const userRepo = makeUserRepo(null, {
      registerUser: jest.fn().mockResolvedValue(registeredUser),
    });
    const emailService = makeMockEmailService();

    const useCase = new RegisterUseCase(userRepo, emailService, 'https://app.example.com');
    await useCase.execute('user@test.com', 'StrongP@ss1!', undefined, undefined, 'en');

    const htmlArg = emailService.sendEmail.mock.calls[0][2];
    expect(htmlArg).toContain('https://app.example.com/en/verify-email?token=');
    expect(htmlArg).not.toContain('/fr/verify-email');
  });

  it('registration succeeds even if email send fails (non-blocking)', async () => {
    const registeredUser = makeUser({ id: 7, email: 'user@test.com' });
    const userRepo = makeUserRepo(null, {
      registerUser: jest.fn().mockResolvedValue(registeredUser),
    });
    const emailService = makeMockEmailService();
    emailService.sendEmail.mockRejectedValue(new Error('SMTP connection refused'));

    const useCase = new RegisterUseCase(userRepo, emailService, 'https://app.example.com');
    const result = await useCase.execute('user@test.com', 'StrongP@ss1!');

    // Registration should still succeed
    expect(result.id).toBe(7);
    expect(result.email).toBe('user@test.com');
  });

  it('registration succeeds even if verification token generation fails', async () => {
    const registeredUser = makeUser({ id: 8 });
    const userRepo = makeUserRepo(null, {
      registerUser: jest.fn().mockResolvedValue(registeredUser),
      setVerificationToken: jest.fn().mockRejectedValue(new Error('DB error')),
    });

    const useCase = new RegisterUseCase(userRepo);
    const result = await useCase.execute('user@test.com', 'StrongP@ss1!');

    // Registration still succeeds
    expect(result.id).toBe(8);
  });

  it('skips email send when no email service or frontend URL is configured', async () => {
    const registeredUser = makeUser({ id: 9 });
    const userRepo = makeUserRepo(null, {
      registerUser: jest.fn().mockResolvedValue(registeredUser),
    });

    const useCase = new RegisterUseCase(userRepo);
    const result = await useCase.execute('user@test.com', 'StrongP@ss1!');

    expect(result.id).toBe(9);
    // setVerificationToken is still called
    expect(userRepo.setVerificationToken).toHaveBeenCalledTimes(1);
  });
});
