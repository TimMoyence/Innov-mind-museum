import { ForgotPasswordUseCase } from '@modules/auth/useCase/forgotPassword.useCase';
import type { EmailService } from '@shared/email/email.port';
import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';

const makeEmailService = (): jest.Mocked<EmailService> => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
});

/**
 * Shared verified-user factory — forgot-password requires email_verified=true (M16).
 * @returns a `User` fixture whose email is already verified.
 */
const makeVerifiedUser = () => makeUser({ email_verified: true });

describe('ForgotPasswordUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Happy paths ──────────────────────────────────────────────────

  it('generates token, stores it, and sends email when user exists and email service is configured', async () => {
    const repo = makeUserRepo(makeVerifiedUser());
    const emailService = makeEmailService();
    const useCase = new ForgotPasswordUseCase(repo, emailService, 'https://app.musaium.com');

    const token = await useCase.execute('user@test.com');

    expect(typeof token).toBe('string');
    expect(token).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
    expect(repo.getUserByEmail).toHaveBeenCalledWith('user@test.com');
    // Stored token is SHA-256 hash (64 hex chars), not the raw token
    const storedToken = repo.setResetToken.mock.calls[0][1];
    expect(storedToken.length).toBe(64); // SHA-256 hash
    expect(storedToken).not.toBe(token); // stored hash !== raw token
    expect(repo.setResetToken).toHaveBeenCalledWith('user@test.com', storedToken, expect.any(Date));
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'user@test.com',
      'Reset your Musaium password',
      expect.stringContaining(token!),
    );
  });

  it('generates token and logs when no email service is configured', async () => {
    const repo = makeUserRepo(makeVerifiedUser());
    const useCase = new ForgotPasswordUseCase(repo);

    const token = await useCase.execute('user@test.com');

    expect(typeof token).toBe('string');
    expect(token).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
    expect(repo.setResetToken).toHaveBeenCalled();
    // No email service, so sendEmail should not have been called at all
  });

  it('sets token expiration roughly 1 hour in the future', async () => {
    const repo = makeUserRepo(makeVerifiedUser());
    const useCase = new ForgotPasswordUseCase(repo);

    const before = Date.now();
    await useCase.execute('user@test.com');
    const after = Date.now();

    const expiresArg = repo.setResetToken.mock.calls[0][2];
    // Expiration should be ~1h from now
    expect(expiresArg.getTime()).toBeGreaterThanOrEqual(before + 3600000 - 100);
    expect(expiresArg.getTime()).toBeLessThanOrEqual(after + 3600000 + 100);
  });

  // ── Anti-enumeration ─────────────────────────────────────────────

  it('returns undefined silently when user does not exist (anti-enumeration)', async () => {
    const repo = makeUserRepo(null);
    const emailService = makeEmailService();
    const useCase = new ForgotPasswordUseCase(repo, emailService, 'https://app.musaium.com');

    const result = await useCase.execute('nonexistent@test.com');

    expect(result).toBeUndefined();
    expect(repo.setResetToken).not.toHaveBeenCalled();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  // ── Email-verified gate (M16) ────────────────────────────────────

  it('silently skips and issues no token when user exists but email is not verified', async () => {
    // makeUser default has email_verified=false
    const repo = makeUserRepo(makeUser());
    const emailService = makeEmailService();
    const useCase = new ForgotPasswordUseCase(repo, emailService, 'https://app.musaium.com');

    const result = await useCase.execute('user@test.com');

    expect(result).toBeUndefined();
    expect(repo.setResetToken).not.toHaveBeenCalled();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  // ── Edge cases ───────────────────────────────────────────────────

  it('returns undefined for empty email string', async () => {
    const repo = makeUserRepo(makeVerifiedUser());
    const useCase = new ForgotPasswordUseCase(repo);

    const result = await useCase.execute('');

    expect(result).toBeUndefined();
    expect(repo.getUserByEmail).not.toHaveBeenCalled();
  });

  it('returns undefined for whitespace-only email', async () => {
    const repo = makeUserRepo(makeVerifiedUser());
    const useCase = new ForgotPasswordUseCase(repo);

    const result = await useCase.execute('   ');

    expect(result).toBeUndefined();
    expect(repo.getUserByEmail).not.toHaveBeenCalled();
  });

  it('returns undefined for null-ish email', async () => {
    const repo = makeUserRepo(makeVerifiedUser());
    const useCase = new ForgotPasswordUseCase(repo);

    const result = await useCase.execute(undefined as unknown as string);

    expect(result).toBeUndefined();
    expect(repo.getUserByEmail).not.toHaveBeenCalled();
  });

  it('does not throw when emailService.sendEmail fails — warns instead', async () => {
    const repo = makeUserRepo(makeVerifiedUser());
    const emailService = makeEmailService();
    emailService.sendEmail.mockRejectedValue(new Error('SMTP timeout'));
    const useCase = new ForgotPasswordUseCase(repo, emailService, 'https://app.musaium.com');

    // Should not throw
    const token = await useCase.execute('user@test.com');

    expect(typeof token).toBe('string');
    expect(token).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
    expect(repo.setResetToken).toHaveBeenCalled();
  });

  it('normalizes email to lowercase and trimmed', async () => {
    const repo = makeUserRepo(makeVerifiedUser());
    const useCase = new ForgotPasswordUseCase(repo);

    await useCase.execute('  User@Test.COM  ');

    expect(repo.getUserByEmail).toHaveBeenCalledWith('user@test.com');
  });

  it('includes reset link with frontendUrl and default locale "fr" in email HTML', async () => {
    const repo = makeUserRepo(makeVerifiedUser());
    const emailService = makeEmailService();
    const useCase = new ForgotPasswordUseCase(repo, emailService, 'https://my-app.com');

    const token = await useCase.execute('user@test.com');
    expect(token).toBeDefined();

    const htmlArg = emailService.sendEmail.mock.calls[0][2];
    expect(htmlArg).toContain(`https://my-app.com/fr/reset-password?token=${token ?? ''}`);
  });

  it('includes reset link with "en" locale when requested', async () => {
    const repo = makeUserRepo(makeVerifiedUser());
    const emailService = makeEmailService();
    const useCase = new ForgotPasswordUseCase(repo, emailService, 'https://my-app.com');

    const token = await useCase.execute('user@test.com', 'en');
    expect(token).toBeDefined();

    const htmlArg = emailService.sendEmail.mock.calls[0][2];
    expect(htmlArg).toContain(`https://my-app.com/en/reset-password?token=${token ?? ''}`);
    expect(htmlArg).not.toContain('/fr/reset-password');
  });

  it('generates unique tokens on successive calls', async () => {
    const repo = makeUserRepo(makeVerifiedUser());
    const useCase = new ForgotPasswordUseCase(repo);

    const token1 = await useCase.execute('user@test.com');
    const token2 = await useCase.execute('user@test.com');

    expect(token1).not.toEqual(token2);
  });
});
