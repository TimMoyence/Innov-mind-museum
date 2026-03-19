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
import { ExportUserDataUseCase } from './exportUserData.useCase';
import { GetProfileUseCase } from './getProfile.useCase';
import { ChangePasswordUseCase } from './changePassword.useCase';
import { VerifyEmailUseCase } from './verifyEmail.useCase';
import { GenerateApiKeyUseCase } from './generateApiKey.useCase';
import { RevokeApiKeyUseCase } from './revokeApiKey.useCase';
import { ListApiKeysUseCase } from './listApiKeys.useCase';
import type { ChatDataExportPort } from '../domain/exportUserData.types';
import { UserRepositoryPg } from '../../../auth/adapters/secondary/user.repository.pg';
import { SocialAccountRepositoryPg } from '../../../auth/adapters/secondary/social-account.repository.pg';
import { RefreshTokenRepositoryPg } from '../../../auth/adapters/secondary/refresh-token.repository.pg';
import { ApiKeyRepositoryPg } from '../../../auth/adapters/secondary/apiKey.repository.pg';
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import type { EmailService } from '@shared/email/email.port';
import { setApiKeyRepository } from '@src/helpers/middleware/apiKey.middleware';

const userRepository = new UserRepositoryPg();
const socialAccountRepository = new SocialAccountRepositoryPg();
const refreshTokenRepository = new RefreshTokenRepositoryPg();

const emailService: EmailService | undefined = env.brevoApiKey
  ? new BrevoEmailService(env.brevoApiKey)
  : undefined;

const frontendUrl = process.env.FRONTEND_URL || undefined;

/** Singleton instance of {@link RegisterUseCase}. */
const registerUseCase = new RegisterUseCase(userRepository, emailService, frontendUrl);
/** Singleton instance of {@link ForgotPasswordUseCase}. */
const forgotPasswordUseCase = new ForgotPasswordUseCase(userRepository, emailService, frontendUrl);
/** Singleton instance of {@link ResetPasswordUseCase}. */
const resetPasswordUseCase = new ResetPasswordUseCase(userRepository);
/** Singleton instance of {@link AuthSessionService}. */
const authSessionService = new AuthSessionService(userRepository, refreshTokenRepository);
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

/** Lazy-bound proxy for GDPR data export — resolves the chat repository at call time. */
const chatDataExportProxy: ChatDataExportPort = {
  async getAllUserData(userId: number) {
    const { getChatRepository } = await import('@modules/chat/index');
    const repo = getChatRepository();
    if (!repo) throw new Error('Chat repository not initialized');
    return repo.exportUserData(userId);
  },
};
const exportUserDataUseCase = new ExportUserDataUseCase({ chatDataExport: chatDataExportProxy });
/** Singleton instance of {@link GetProfileUseCase}. */
const getProfileUseCase = new GetProfileUseCase(userRepository);
/** Singleton instance of {@link ChangePasswordUseCase}. */
const changePasswordUseCase = new ChangePasswordUseCase(userRepository, refreshTokenRepository);
/** Singleton instance of {@link VerifyEmailUseCase}. */
const verifyEmailUseCase = new VerifyEmailUseCase(userRepository);

// API Key use cases — only wired when feature flag is enabled
const apiKeyRepository = new ApiKeyRepositoryPg();
const generateApiKeyUseCase = new GenerateApiKeyUseCase(apiKeyRepository);
const revokeApiKeyUseCase = new RevokeApiKeyUseCase(apiKeyRepository);
const listApiKeysUseCase = new ListApiKeysUseCase(apiKeyRepository);

// Register the repository with the middleware so it can validate API keys
if (env.featureFlags.apiKeys) {
  setApiKeyRepository(apiKeyRepository);
}

export {
  registerUseCase,
  forgotPasswordUseCase,
  resetPasswordUseCase,
  authSessionService,
  socialLoginUseCase,
  deleteAccountUseCase,
  exportUserDataUseCase,
  getProfileUseCase,
  changePasswordUseCase,
  verifyEmailUseCase,
  generateApiKeyUseCase,
  revokeApiKeyUseCase,
  listApiKeysUseCase,
};
