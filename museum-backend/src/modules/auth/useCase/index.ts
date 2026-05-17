/** Auth module composition root — wires repos to use-cases, exports singletons. */
import { AppDataSource } from '@data/db/data-source';
import { ApiKeyRepositoryPg } from '@modules/auth/adapters/secondary/pg/apiKey.repository.pg';
import { RefreshTokenRepositoryPg } from '@modules/auth/adapters/secondary/pg/refresh-token.repository.pg';
import { SocialAccountRepositoryPg } from '@modules/auth/adapters/secondary/pg/social-account.repository.pg';
import { TotpSecretRepositoryPg } from '@modules/auth/adapters/secondary/pg/totp-secret.repository.pg';
import { UserRepositoryPg } from '@modules/auth/adapters/secondary/pg/user.repository.pg';
import { UserConsentRepositoryPg } from '@modules/auth/adapters/secondary/pg/userConsent.repository.pg';
import { socialNonceStore } from '@modules/auth/adapters/secondary/social/nonce-store';
import { InMemorySocialOtcStore } from '@modules/auth/adapters/secondary/social/social-otc-store';
import { SocialTokenVerifierAdapter } from '@modules/auth/adapters/secondary/social/social-token-verifier.adapter';
import {
  DeleteAccountUseCase,
  type ImageCleanupPort,
} from '@modules/auth/useCase/account/deleteAccount.useCase';
import { ExportUserDataUseCase } from '@modules/auth/useCase/account/exportUserData.useCase';
import { GetProfileUseCase } from '@modules/auth/useCase/account/getProfile.useCase';
import { UpdateProfilePreferencesUseCase } from '@modules/auth/useCase/account/updateProfilePreferences.useCase';
import { GenerateApiKeyUseCase } from '@modules/auth/useCase/api-keys/generateApiKey.useCase';
import { ListApiKeysUseCase } from '@modules/auth/useCase/api-keys/listApiKeys.useCase';
import { RevokeApiKeyUseCase } from '@modules/auth/useCase/api-keys/revokeApiKey.useCase';
import { GrantConsentUseCase } from '@modules/auth/useCase/consent/grantConsent.useCase';
import { RevokeConsentUseCase } from '@modules/auth/useCase/consent/revokeConsent.useCase';
import { UpdateContentPreferencesUseCase } from '@modules/auth/useCase/consent/updateContentPreferences.useCase';
import { UpdateTtsVoiceUseCase } from '@modules/auth/useCase/consent/updateTtsVoice.useCase';
import { ChangeEmailUseCase } from '@modules/auth/useCase/email/changeEmail.useCase';
import { ConfirmEmailChangeUseCase } from '@modules/auth/useCase/email/confirmEmailChange.useCase';
import { ChangePasswordUseCase } from '@modules/auth/useCase/password/changePassword.useCase';
import { ForgotPasswordUseCase } from '@modules/auth/useCase/password/forgotPassword.useCase';
import { ResetPasswordUseCase } from '@modules/auth/useCase/password/resetPassword.useCase';
import { RegisterUseCase } from '@modules/auth/useCase/registration/register.useCase';
import { VerifyEmailUseCase } from '@modules/auth/useCase/registration/verifyEmail.useCase';
import { AuthSessionService } from '@modules/auth/useCase/session/authSession.service';
import { RedeemSocialOtcUseCase } from '@modules/auth/useCase/social/redeemSocialOtc.useCase';
import { SocialLoginUseCase } from '@modules/auth/useCase/social/socialLogin.useCase';
import { ChallengeMfaUseCase } from '@modules/auth/useCase/totp/challengeMfa.useCase';
import { DisableMfaUseCase } from '@modules/auth/useCase/totp/disableMfa.useCase';
import { EnrollMfaUseCase } from '@modules/auth/useCase/totp/enrollMfa.useCase';
import { GetMfaStatusUseCase } from '@modules/auth/useCase/totp/getMfaStatus.useCase';
import { RecoveryMfaUseCase } from '@modules/auth/useCase/totp/recoveryMfa.useCase';
import { VerifyMfaUseCase } from '@modules/auth/useCase/totp/verifyMfa.useCase';
import { auditService } from '@shared/audit';
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import { TestEmailService } from '@shared/email/test-email-service';
import { setApiKeyRepository, setUserRoleResolver } from '@shared/middleware/apiKey.middleware';
import { env } from '@src/config/env';

import type {
  ChatDataExportPort,
  ReviewDataExportPort,
  SupportDataExportPort,
  UserReviewExportEntry,
  UserSupportTicketExportEntry,
} from '@modules/auth/domain/exportUserData.types';
import type { AuthSessionResponse } from '@modules/auth/useCase/session/authSession.service';
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

const forgotPasswordUseCase = new ForgotPasswordUseCase(userRepository, emailService, frontendUrl);
/** Revokes refresh tokens on reset (OWASP). */
const resetPasswordUseCase = new ResetPasswordUseCase(userRepository, refreshTokenRepository);
const authSessionService = new AuthSessionService(
  userRepository,
  refreshTokenRepository,
  totpSecretRepository,
);

/** R16 MFA singletons. */
const enrollMfaUseCase = new EnrollMfaUseCase(userRepository, totpSecretRepository);
const verifyMfaUseCase = new VerifyMfaUseCase(userRepository, totpSecretRepository);
const disableMfaUseCase = new DisableMfaUseCase(userRepository, totpSecretRepository);
const getMfaStatusUseCase = new GetMfaStatusUseCase(totpSecretRepository);
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
 * F3 — OIDC nonce store. Delegating singleton: `src/index.ts` boot can upgrade
 * to {@link RedisNonceStore} via `setSocialNonceStore` once shared Redis is
 * wired. Initial delegate {@link InMemoryNonceStore} keeps dev/tests working.
 */
const nonceStore = socialNonceStore;

/**
 * F11-mobile — store for the mobile-redirect OAuth flow. Holds the issued
 * AuthSessionResponse keyed by a single-use opaque code that travels back via
 * the /google/callback deeplink and is exchanged via POST /api/auth/social-redeem.
 */
const socialOtcStore = new InMemorySocialOtcStore<AuthSessionResponse>();

const socialLoginUseCase = new SocialLoginUseCase(
  userRepository,
  socialAccountRepository,
  authSessionService,
  socialTokenVerifier,
  nonceStore,
);

const redeemSocialOtcUseCase = new RedeemSocialOtcUseCase(socialOtcStore);
/** Lazy image cleanup via chat module — late-bind to avoid circular init. */
const imageCleanupProxy: ImageCleanupPort = {
  async deleteByPrefix(prefix: string): Promise<void> {
    const { getImageStorage } = await import('@modules/chat/chat-module');
    await getImageStorage().deleteByPrefix(prefix);
  },
};
const deleteAccountUseCase = new DeleteAccountUseCase(userRepository, imageCleanupProxy);

/** Lazy-bound — resolves the chat repository at call time. */
const chatDataExportProxy: ChatDataExportPort = {
  async getAllUserData(userId: number) {
    const { getChatRepository } = await import('@modules/chat/chat-module');
    return await getChatRepository().exportUserData(userId);
  },
};

/** Lazy-bound — resolves the review repository at call time. */
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

/** Lazy-bound — resolves the support repository at call time. */
const supportDataExportProxy: SupportDataExportPort = {
  async listForUser(userId: number): Promise<UserSupportTicketExportEntry[]> {
    const { SupportRepositoryPg } =
      await import('@modules/support/adapters/secondary/pg/support.repository.pg');
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
const getProfileUseCase = new GetProfileUseCase(userRepository);
const changePasswordUseCase = new ChangePasswordUseCase(userRepository, refreshTokenRepository);
const changeEmailUseCase = new ChangeEmailUseCase(userRepository, emailService, frontendUrl);
/** Revokes refresh tokens on success (M13). */
const confirmEmailChangeUseCase = new ConfirmEmailChangeUseCase(
  userRepository,
  refreshTokenRepository,
);
const verifyEmailUseCase = new VerifyEmailUseCase(userRepository);
const updateContentPreferencesUseCase = new UpdateContentPreferencesUseCase(userRepository);
const updateTtsVoiceUseCase = new UpdateTtsVoiceUseCase(userRepository);
/** TD-2 — batch endpoint. */
const updateProfilePreferencesUseCase = new UpdateProfilePreferencesUseCase(userRepository);

// B2B API key programme (msk_* auth).
const apiKeyRepository = new ApiKeyRepositoryPg(AppDataSource);
const generateApiKeyUseCase = new GenerateApiKeyUseCase(apiKeyRepository);
const revokeApiKeyUseCase = new RevokeApiKeyUseCase(apiKeyRepository);
const listApiKeysUseCase = new ListApiKeysUseCase(apiKeyRepository);

// GDPR consent — every grant/revoke writes a hash-chained `audit_logs` row
// (S4-P0-02 — Apple Guideline 5.1.2(i) compliance).
const grantConsentUseCase = new GrantConsentUseCase(userConsentRepository, auditService);
const revokeConsentUseCase = new RevokeConsentUseCase(userConsentRepository, auditService);

/** Wired after `grantConsentUseCase` — records ToS/privacy consent server-side. */
const registerUseCase = new RegisterUseCase(
  userRepository,
  emailService,
  frontendUrl,
  grantConsentUseCase,
);

/**
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

const completeOnboarding = async (userId: number): Promise<void> => {
  await userRepository.markOnboardingCompleted(userId);
};

export {
  registerUseCase,
  forgotPasswordUseCase,
  resetPasswordUseCase,
  authSessionService,
  socialLoginUseCase,
  redeemSocialOtcUseCase,
  nonceStore,
  socialOtcStore,
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
  updateProfilePreferencesUseCase,
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
  getMfaStatusUseCase,
  wireAuthMiddleware,
};
