/**
 * Auth module composition root.
 * Wires repository implementations to use-case classes and exports ready-to-use singleton instances.
 */
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import { TestEmailService } from '@shared/email/test-email-service';
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
import { GrantConsentUseCase } from './grantConsent.useCase';
import { ListApiKeysUseCase } from './listApiKeys.useCase';
import { RegisterUseCase } from './register.useCase';
import { ResetPasswordUseCase } from './resetPassword.useCase';
import { RevokeApiKeyUseCase } from './revokeApiKey.useCase';
import { RevokeConsentUseCase } from './revokeConsent.useCase';
import { SocialLoginUseCase } from './socialLogin.useCase';
import { ChallengeMfaUseCase } from './totp/challengeMfa.useCase';
import { DisableMfaUseCase } from './totp/disableMfa.useCase';
import { EnrollMfaUseCase } from './totp/enrollMfa.useCase';
import { RecoveryMfaUseCase } from './totp/recoveryMfa.useCase';
import { VerifyMfaUseCase } from './totp/verifyMfa.useCase';
import { UpdateContentPreferencesUseCase } from './updateContentPreferences.useCase';
import { UpdateTtsVoiceUseCase } from './updateTtsVoice.useCase';
import { VerifyEmailUseCase } from './verifyEmail.useCase';
import { ApiKeyRepositoryPg } from '../adapters/secondary/apiKey.repository.pg';
import { InMemoryNonceStore } from '../adapters/secondary/nonce-store';
import { RefreshTokenRepositoryPg } from '../adapters/secondary/refresh-token.repository.pg';
import { SocialAccountRepositoryPg } from '../adapters/secondary/social-account.repository.pg';
import { SocialTokenVerifierAdapter } from '../adapters/secondary/social-token-verifier.adapter';
import { TotpSecretRepositoryPg } from '../adapters/secondary/totp-secret.repository.pg';
import { UserRepositoryPg } from '../adapters/secondary/user.repository.pg';
import { UserConsentRepositoryPg } from '../adapters/secondary/userConsent.repository.pg';

import type {
  ChatDataExportPort,
  ReviewDataExportPort,
  SupportDataExportPort,
  UserReviewExportEntry,
  UserSupportTicketExportEntry,
} from '../domain/exportUserData.types';
import type { EmailService } from '@shared/email/email.port';

const userRepository = new UserRepositoryPg(AppDataSource);
const socialAccountRepository = new SocialAccountRepositoryPg(AppDataSource);
const socialTokenVerifier = new SocialTokenVerifierAdapter();
const refreshTokenRepository = new RefreshTokenRepositoryPg(AppDataSource);
const totpSecretRepository = new TotpSecretRepositoryPg(AppDataSource);

const testEmailService = env.auth.emailServiceKind === 'test' ? new TestEmailService() : null;

const emailService: EmailService | undefined =
  testEmailService ?? (env.brevoApiKey ? new BrevoEmailService(env.brevoApiKey) : undefined);

/** Test-only handle on the in-memory email service. Null in prod. */
export const __testEmailService = testEmailService;

const frontendUrl = env.frontendUrl;

/** Singleton instance of {@link RegisterUseCase}. */
const registerUseCase = new RegisterUseCase(userRepository, emailService, frontendUrl);
/** Singleton instance of {@link ForgotPasswordUseCase}. */
const forgotPasswordUseCase = new ForgotPasswordUseCase(userRepository, emailService, frontendUrl);
/** Singleton instance of {@link ResetPasswordUseCase}. Revokes refresh tokens on reset (OWASP). */
const resetPasswordUseCase = new ResetPasswordUseCase(userRepository, refreshTokenRepository);
/** Singleton instance of {@link AuthSessionService}. */
const authSessionService = new AuthSessionService(
  userRepository,
  refreshTokenRepository,
  totpSecretRepository,
);

/** R16 MFA singletons. */
const enrollMfaUseCase = new EnrollMfaUseCase(userRepository, totpSecretRepository);
const verifyMfaUseCase = new VerifyMfaUseCase(userRepository, totpSecretRepository);
const disableMfaUseCase = new DisableMfaUseCase(userRepository, totpSecretRepository);
const challengeMfaUseCase = new ChallengeMfaUseCase(
  userRepository,
  totpSecretRepository,
  authSessionService,
);
const recoveryMfaUseCase = new RecoveryMfaUseCase(
  userRepository,
  totpSecretRepository,
  authSessionService,
);
/**
 * F3 — OIDC nonce store. The Redis-backed adapter is preferred when a Redis
 * client is available (multi-instance correctness) but the auth composition
 * root runs at module load before the rate-limit Redis client is registered;
 * for now wire the in-memory adapter and let a future migration upgrade to
 * Redis once a shared client is exposed at module-init time. Single-instance
 * deployments (current default) are unaffected.
 */
const nonceStore = new InMemoryNonceStore();

/** Singleton instance of {@link SocialLoginUseCase}. */
const socialLoginUseCase = new SocialLoginUseCase(
  userRepository,
  socialAccountRepository,
  authSessionService,
  socialTokenVerifier,
  nonceStore,
);
/** Singleton instance of {@link DeleteAccountUseCase}. Lazy image cleanup via chat module's shared storage. */
const imageCleanupProxy: ImageCleanupPort = {
  async deleteByPrefix(prefix: string): Promise<void> {
    // Late-bind to avoid circular init: chat module initializes after auth module
    const { getImageStorage } = await import('@modules/chat/wiring');
    await getImageStorage().deleteByPrefix(prefix);
  },
};
const deleteAccountUseCase = new DeleteAccountUseCase(userRepository, imageCleanupProxy);

/** Lazy-bound proxy for GDPR data export — resolves the chat repository at call time. */
const chatDataExportProxy: ChatDataExportPort = {
  async getAllUserData(userId: number) {
    const { getChatRepository } = await import('@modules/chat/wiring');
    return await getChatRepository().exportUserData(userId);
  },
};

/** Lazy-bound proxy for GDPR review export — resolves the review repository at call time. */
const reviewDataExportProxy: ReviewDataExportPort = {
  async listForUser(userId: number): Promise<UserReviewExportEntry[]> {
    const { ReviewRepositoryPg } =
      await import('@modules/review/adapters/secondary/pg/review.repository.pg');
    const repo = new ReviewRepositoryPg(AppDataSource);
    const rows = await repo.listForUser(userId);
    return rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      status: r.status,
      userName: r.userName,
      createdAt: r.createdAt,
    }));
  },
};

/** Lazy-bound proxy for GDPR support-ticket export — resolves the support repository at call time. */
const supportDataExportProxy: SupportDataExportPort = {
  async listForUser(userId: number): Promise<UserSupportTicketExportEntry[]> {
    const { SupportRepositoryPg } =
      await import('@modules/support/adapters/secondary/support.repository.pg');
    const repo = new SupportRepositoryPg(AppDataSource);
    const rows = await repo.listForUser(userId);
    return rows.map((t) => ({
      id: t.id,
      subject: t.subject,
      description: t.description,
      status: t.status,
      priority: t.priority,
      category: t.category,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      messages: t.messages.map((m) => ({
        id: m.id,
        senderRole: m.senderRole,
        text: m.text,
        createdAt: m.createdAt,
      })),
    }));
  },
};

const userConsentRepository = new UserConsentRepositoryPg(AppDataSource);

const exportUserDataUseCase = new ExportUserDataUseCase({
  chatDataExport: chatDataExportProxy,
  reviewDataExport: reviewDataExportProxy,
  supportDataExport: supportDataExportProxy,
  userConsentRepository,
});
/** Singleton instance of {@link GetProfileUseCase}. */
const getProfileUseCase = new GetProfileUseCase(userRepository);
/** Singleton instance of {@link ChangePasswordUseCase}. */
const changePasswordUseCase = new ChangePasswordUseCase(userRepository, refreshTokenRepository);
/** Singleton instance of {@link ChangeEmailUseCase}. */
const changeEmailUseCase = new ChangeEmailUseCase(userRepository, emailService, frontendUrl);
/** Singleton instance of {@link ConfirmEmailChangeUseCase}. Revokes refresh tokens on success (M13). */
const confirmEmailChangeUseCase = new ConfirmEmailChangeUseCase(
  userRepository,
  refreshTokenRepository,
);
/** Singleton instance of {@link VerifyEmailUseCase}. */
const verifyEmailUseCase = new VerifyEmailUseCase(userRepository);
/** Singleton instance of {@link UpdateContentPreferencesUseCase}. */
const updateContentPreferencesUseCase = new UpdateContentPreferencesUseCase(userRepository);
/** Singleton instance of {@link UpdateTtsVoiceUseCase}. */
const updateTtsVoiceUseCase = new UpdateTtsVoiceUseCase(userRepository);

// API Key use cases — always wired (B2B API key programme, msk_* auth).
const apiKeyRepository = new ApiKeyRepositoryPg(AppDataSource);
const generateApiKeyUseCase = new GenerateApiKeyUseCase(apiKeyRepository);
const revokeApiKeyUseCase = new RevokeApiKeyUseCase(apiKeyRepository);
const listApiKeysUseCase = new ListApiKeysUseCase(apiKeyRepository);

// GDPR consent use cases (userConsentRepository is initialised earlier alongside the DSAR export use case).
const grantConsentUseCase = new GrantConsentUseCase(userConsentRepository);
const revokeConsentUseCase = new RevokeConsentUseCase(userConsentRepository);

/**
 * Registers the API-key middleware globals (apiKeyRepository + userRoleResolver).
 * Called from `createApp()` so module import alone has no side effects on the
 * shared middleware state — keeps test isolation predictable.
 */
const wireAuthMiddleware = (): void => {
  setApiKeyRepository(apiKeyRepository);
  setUserRoleResolver(async (userId) => {
    const user = await userRepository.getUserById(userId);
    return user?.role ?? null;
  });
};

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
  nonceStore,
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
  updateTtsVoiceUseCase,
  completeOnboarding,
  grantConsentUseCase,
  revokeConsentUseCase,
  userConsentRepository,
  userRepository,
  enrollMfaUseCase,
  verifyMfaUseCase,
  disableMfaUseCase,
  challengeMfaUseCase,
  recoveryMfaUseCase,
  wireAuthMiddleware,
};
