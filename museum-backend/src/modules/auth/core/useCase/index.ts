/**
 * Auth module composition root.
 * Wires repository implementations to use-case classes and exports ready-to-use singleton instances.
 */
import { env } from '@src/config/env';
import { RegisterUseCase } from './register.useCase';
import { ForgotPasswordUseCase } from './forgotPassword.useCase';
import { ResetPasswordUseCase } from './resetPassword.useCase';
import { AuthSessionService } from './authSession.service';
import { SocialLoginUseCase } from './socialLogin.useCase';
import { DeleteAccountUseCase } from './deleteAccount.useCase';
import { UserRepositoryPg } from '../../../auth/adapters/secondary/user.repository.pg';
import { SocialAccountRepositoryPg } from '../../../auth/adapters/secondary/social-account.repository.pg';
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import type { EmailService } from '@shared/email/email.port';

const userRepository = new UserRepositoryPg();
const socialAccountRepository = new SocialAccountRepositoryPg();

const emailService: EmailService | undefined = env.brevoApiKey
  ? new BrevoEmailService(env.brevoApiKey)
  : undefined;

const frontendUrl = process.env.FRONTEND_URL || undefined;

/** Singleton instance of {@link RegisterUseCase}. */
const registerUseCase = new RegisterUseCase(userRepository);
/** Singleton instance of {@link ForgotPasswordUseCase}. */
const forgotPasswordUseCase = new ForgotPasswordUseCase(userRepository, emailService, frontendUrl);
/** Singleton instance of {@link ResetPasswordUseCase}. */
const resetPasswordUseCase = new ResetPasswordUseCase(userRepository);
/** Singleton instance of {@link AuthSessionService}. */
const authSessionService = new AuthSessionService(userRepository);
/** Singleton instance of {@link SocialLoginUseCase}. */
const socialLoginUseCase = new SocialLoginUseCase(
  userRepository,
  socialAccountRepository,
  authSessionService,
);
/** Singleton instance of {@link DeleteAccountUseCase}. Lazy image cleanup via chat module's shared storage. */
const imageCleanupProxy: import('./deleteAccount.useCase').ImageCleanupPort = {
  async deleteByPrefix(prefix: string): Promise<void> {
    // Late-bind to avoid circular init: chat module initializes after auth module
    const { getImageStorage } = await import('@modules/chat/index');
    const storage = getImageStorage();
    if (storage) await storage.deleteByPrefix(prefix);
  },
};
const deleteAccountUseCase = new DeleteAccountUseCase(userRepository, imageCleanupProxy);

export {
  registerUseCase,
  forgotPasswordUseCase,
  resetPasswordUseCase,
  authSessionService,
  socialLoginUseCase,
  deleteAccountUseCase,
};
