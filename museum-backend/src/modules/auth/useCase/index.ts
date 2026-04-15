/**
 * Auth module composition root.
 * Wires repository implementations to use-case classes and exports ready-to-use singleton instances.
 */
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import { env } from '@src/config/env';
import { AppDataSource } from '@src/data/db/data-source';
import {
  setApiKeyRepository,
  setUserRoleResolver,
} from '@src/helpers/middleware/apiKey.middleware';

import { AuthSessionService } from './authSession.service';
import { ChangeEmailUseCase } from './changeEmail.useCase';
import { ChangePasswordUseCase } from './changePassword.useCase';
import { ConfirmEmailChangeUseCase } from './confirmEmailChange.useCase';
import { DeleteAccountUseCase, type ImageCleanupPort } from './deleteAccount.useCase';
import { ExportUserDataUseCase } from './exportUserData.useCase';
import { ForgotPasswordUseCase } from './forgotPassword.useCase';
import { GenerateApiKeyUseCase } from './generateApiKey.useCase';
import { GetProfileUseCase } from './getProfile.useCase';
import { ListApiKeysUseCase } from './listApiKeys.useCase';
import { RegisterUseCase } from './register.useCase';
import { ResetPasswordUseCase } from './resetPassword.useCase';
import { RevokeApiKeyUseCase } from './revokeApiKey.useCase';
import { SocialLoginUseCase } from './socialLogin.useCase';
import { UpdateContentPreferencesUseCase } from './updateContentPreferences.useCase';
import { VerifyEmailUseCase } from './verifyEmail.useCase';
import { ApiKeyRepositoryPg } from '../adapters/secondary/apiKey.repository.pg';
import { RefreshTokenRepositoryPg } from '../adapters/secondary/refresh-token.repository.pg';
import { SocialAccountRepositoryPg } from '../adapters/secondary/social-account.repository.pg';
import { SocialTokenVerifierAdapter } from '../adapters/secondary/social-token-verifier.adapter';
import { UserRepositoryPg } from '../adapters/secondary/user.repository.pg';

import type { ChatDataExportPort } from '../domain/exportUserData.types';
import type { EmailService } from '@shared/email/email.port';

const userRepository = new UserRepositoryPg(AppDataSource);
const socialAccountRepository = new SocialAccountRepositoryPg(AppDataSource);
const socialTokenVerifier = new SocialTokenVerifierAdapter();
const refreshTokenRepository = new RefreshTokenRepositoryPg(AppDataSource);

const emailService: EmailService | undefined = env.brevoApiKey
  ? new BrevoEmailService(env.brevoApiKey)
  : undefined;

const frontendUrl = env.frontendUrl;

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
  socialTokenVerifier,
);
/** Singleton instance of {@link DeleteAccountUseCase}. Lazy image cleanup via chat module's shared storage. */
const imageCleanupProxy: ImageCleanupPort = {
  async deleteByPrefix(prefix: string): Promise<void> {
    // Late-bind to avoid circular init: chat module initializes after auth module
    const { getImageStorage } = await import('@modules/chat/index');
    await getImageStorage().deleteByPrefix(prefix);
  },
};
const deleteAccountUseCase = new DeleteAccountUseCase(userRepository, imageCleanupProxy);

/** Lazy-bound proxy for GDPR data export — resolves the chat repository at call time. */
const chatDataExportProxy: ChatDataExportPort = {
  async getAllUserData(userId: number) {
    const { getChatRepository } = await import('@modules/chat/index');
    return await getChatRepository().exportUserData(userId);
  },
};
const exportUserDataUseCase = new ExportUserDataUseCase({ chatDataExport: chatDataExportProxy });
/** Singleton instance of {@link GetProfileUseCase}. */
const getProfileUseCase = new GetProfileUseCase(userRepository);
/** Singleton instance of {@link ChangePasswordUseCase}. */
const changePasswordUseCase = new ChangePasswordUseCase(userRepository, refreshTokenRepository);
/** Singleton instance of {@link ChangeEmailUseCase}. */
const changeEmailUseCase = new ChangeEmailUseCase(userRepository, emailService, frontendUrl);
/** Singleton instance of {@link ConfirmEmailChangeUseCase}. */
const confirmEmailChangeUseCase = new ConfirmEmailChangeUseCase(userRepository);
/** Singleton instance of {@link VerifyEmailUseCase}. */
const verifyEmailUseCase = new VerifyEmailUseCase(userRepository);
/** Singleton instance of {@link UpdateContentPreferencesUseCase}. */
const updateContentPreferencesUseCase = new UpdateContentPreferencesUseCase(userRepository);

// API Key use cases — only wired when feature flag is enabled
const apiKeyRepository = new ApiKeyRepositoryPg(AppDataSource);
const generateApiKeyUseCase = new GenerateApiKeyUseCase(apiKeyRepository);
const revokeApiKeyUseCase = new RevokeApiKeyUseCase(apiKeyRepository);
const listApiKeysUseCase = new ListApiKeysUseCase(apiKeyRepository);

// Register the repository with the middleware so it can validate API keys
if (env.featureFlags.apiKeys) {
  setApiKeyRepository(apiKeyRepository);
  setUserRoleResolver(async (userId) => {
    const user = await userRepository.getUserById(userId);
    return user?.role ?? null;
  });
}

/** Marks the user's onboarding as completed in the database. */
const completeOnboarding = async (userId: number): Promise<void> => {
  await userRepository.markOnboardingCompleted(userId);
};

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
  changeEmailUseCase,
  confirmEmailChangeUseCase,
  verifyEmailUseCase,
  generateApiKeyUseCase,
  revokeApiKeyUseCase,
  listApiKeysUseCase,
  updateContentPreferencesUseCase,
  completeOnboarding,
};
