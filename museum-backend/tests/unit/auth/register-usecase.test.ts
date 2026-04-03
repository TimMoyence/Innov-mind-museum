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
  },
}));

import { RegisterUseCase } from '@modules/auth/core/useCase/register.useCase';
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

  it('generates a verification token after registration', async () => {
    const registeredUser = makeUser({ id: 5 });
    const userRepo = makeUserRepo(null, {
      registerUser: jest.fn().mockResolvedValue(registeredUser),
    });

    const useCase = new RegisterUseCase(userRepo);
    await useCase.execute('user@test.com', 'StrongP@ss1!');

    expect(userRepo.setVerificationToken).toHaveBeenCalledTimes(1);
    expect(userRepo.setVerificationToken).toHaveBeenCalledWith(
      5,
      expect.stringMatching(/^[a-f0-9]{64}$/), // 32 bytes -> 64 hex chars
      expect.any(Date),
    );
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
