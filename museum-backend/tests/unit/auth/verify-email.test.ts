import { VerifyEmailUseCase } from '@modules/auth/useCase/verifyEmail.useCase';
import { RegisterUseCase } from '@modules/auth/useCase/register.useCase';
import type { EmailService } from '@shared/email/email.port';
import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';

describe('VerifyEmailUseCase', () => {
  it('returns { verified: true } for a valid token', async () => {
    const repo = makeUserRepo(makeUser());
    const useCase = new VerifyEmailUseCase(repo);

    const result = await useCase.execute('valid-token');

    expect(result).toEqual({ verified: true });
    expect(repo.verifyEmail).toHaveBeenCalledWith('valid-token');
  });

  it('throws 400 for expired/invalid token', async () => {
    const repo = makeUserRepo(null);
    const useCase = new VerifyEmailUseCase(repo);

    await expect(useCase.execute('expired-token')).rejects.toMatchObject({
      message: 'Invalid or expired verification token',
      statusCode: 400,
    });
  });

  it('throws 400 for empty token', async () => {
    const repo = makeUserRepo(null);
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
    const repo = makeUserRepo(user);
    repo.getUserByEmail.mockResolvedValue(null);
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
    const repo = makeUserRepo(user);
    repo.getUserByEmail.mockResolvedValue(null);
    const emailService: EmailService = {
      sendEmail: jest.fn().mockRejectedValue(new Error('SMTP down')),
    };
    const useCase = new RegisterUseCase(repo, emailService, 'https://app.example.com');

    const result = await useCase.execute('test@example.com', 'ValidPass1', 'Test', 'User');

    expect(result).toEqual(user);
  });
});
