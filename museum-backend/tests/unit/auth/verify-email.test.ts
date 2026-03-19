import { VerifyEmailUseCase } from '@modules/auth/core/useCase/verifyEmail.useCase';
import { RegisterUseCase } from '@modules/auth/core/useCase/register.useCase';
import type { IUserRepository } from '@modules/auth/core/domain/user.repository.interface';
import type { User } from '@modules/auth/core/domain/user.entity';
import type { EmailService } from '@shared/email/email.port';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    email: 'test@example.com',
    password: '$2b$12$hash',
    firstname: 'Test',
    lastname: 'User',
    email_verified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;

describe('VerifyEmailUseCase', () => {
  it('returns { verified: true } for a valid token', async () => {
    const repo = {
      verifyEmail: jest.fn().mockResolvedValue(makeUser()),
    } as unknown as IUserRepository;
    const useCase = new VerifyEmailUseCase(repo);

    const result = await useCase.execute('valid-token');

    expect(result).toEqual({ verified: true });
    expect(repo.verifyEmail).toHaveBeenCalledWith('valid-token');
  });

  it('throws 400 for expired/invalid token', async () => {
    const repo = {
      verifyEmail: jest.fn().mockResolvedValue(null),
    } as unknown as IUserRepository;
    const useCase = new VerifyEmailUseCase(repo);

    await expect(useCase.execute('expired-token')).rejects.toMatchObject({
      message: 'Invalid or expired verification token',
      statusCode: 400,
    });
  });

  it('throws 400 for empty token', async () => {
    const repo = {
      verifyEmail: jest.fn(),
    } as unknown as IUserRepository;
    const useCase = new VerifyEmailUseCase(repo);

    await expect(useCase.execute('')).rejects.toMatchObject({
      message: 'Verification token is required',
      statusCode: 400,
    });
  });
});

describe('RegisterUseCase — verification email', () => {
  it('generates token and calls email service after registration', async () => {
    const user = makeUser();
    const repo = {
      getUserByEmail: jest.fn().mockResolvedValue(null),
      registerUser: jest.fn().mockResolvedValue(user),
      setVerificationToken: jest.fn().mockResolvedValue(undefined),
    } as unknown as IUserRepository;
    const emailService: EmailService = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new RegisterUseCase(repo, emailService, 'https://app.example.com');

    await useCase.execute('test@example.com', 'ValidPass1', 'Test', 'User');

    expect(repo.setVerificationToken).toHaveBeenCalledWith(
      user.id,
      expect.any(String),
      expect.any(Date),
    );
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'test@example.com',
      'Verify your Musaium email',
      expect.stringContaining('verify-email?token='),
    );
  });

  it('succeeds even if email sending fails', async () => {
    const user = makeUser();
    const repo = {
      getUserByEmail: jest.fn().mockResolvedValue(null),
      registerUser: jest.fn().mockResolvedValue(user),
      setVerificationToken: jest.fn().mockResolvedValue(undefined),
    } as unknown as IUserRepository;
    const emailService: EmailService = {
      sendEmail: jest.fn().mockRejectedValue(new Error('SMTP down')),
    };
    const useCase = new RegisterUseCase(repo, emailService, 'https://app.example.com');

    const result = await useCase.execute('test@example.com', 'ValidPass1', 'Test', 'User');

    expect(result).toEqual(user);
  });
});
