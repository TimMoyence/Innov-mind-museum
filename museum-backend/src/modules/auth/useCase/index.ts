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
  type LegacyImageRefLookup,
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
import { logger } from '@shared/logger/logger';
import { setApiKeyRepository, setUserRoleResolver } from '@shared/middleware/apiKey.middleware';
import { env } from '@src/config/env';

import type {
  ApiKeyExportPort,
  ApiKeySource,
  AuditLogExportPort,
  AuditLogSource,
  ChatDataExportPort,
  MessageFeedbackExportPort,
  MessageFeedbackSource,
  MessageReportExportPort,
  MessageReportSource,
  ReviewDataExportPort,
  SocialAccountExportPort,
  SocialAccountSource,
  SupportDataExportPort,
  UserMemoryExportPort,
  UserMemorySource,
  UserReviewExportEntry,
  UserSupportTicketExportEntry,
} from '@modules/auth/domain/exportUserData.types';
import type { AuthSessionResponse } from '@modules/auth/useCase/session/authSession.service';
import type { EmailService } from '@shared/email/email.port';
import type {
  AudioCleanupPort,
  MarketingContactRemovalPort,
} from '@shared/ports/audio-cleanup.port';

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
  async deleteByPrefix(userId, legacyFetcher): Promise<void> {
    const { getImageStorage } = await import('@modules/chat/chat-module');
    // B4/R8 — forward BOTH args; dropping `legacyFetcher` silently disabled the
    // DB-sourced cleanup that reaches production-layout keys.
    await getImageStorage().deleteByPrefix(userId, legacyFetcher);
  },
};

/**
 * R9 — DB-sourced legacy/full image-ref fetcher. Lazy-bound to the chat repo so
 * `DeleteAccountUseCase` can reach production-layout image keys regardless of
 * the native scan prefix.
 */
const legacyImageRefLookupProxy: LegacyImageRefLookup = {
  async findLegacyImageRefsByUserId(userId: number): Promise<string[]> {
    const { getChatRepository } = await import('@modules/chat/chat-module');
    return await getChatRepository().findLegacyImageRefsByUserId(userId);
  },
};

/**
 * B1/R1-R3 — resolves the user's TTS audio refs from the chat repo and deletes
 * each S3 object via `AudioStorage.deleteByRef`. Per-ref try/catch so one bad
 * ref doesn't strand the rest. Lazy-bound to avoid a static auth→chat dep.
 */
const audioCleanupProxy: AudioCleanupPort = {
  async deleteUserAudio(userId: number): Promise<void> {
    const { getChatRepository, getAudioStorage } = await import('@modules/chat/chat-module');
    const audioStorage = getAudioStorage();
    if (!audioStorage) return;
    const refs = await getChatRepository().findAudioRefsByUserId(userId);
    for (const ref of refs) {
      try {
        await audioStorage.deleteByRef(ref);
      } catch (error) {
        logger.warn('delete_account_audio_ref_delete_failed', {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
};

/**
 * B2/R4-R6 — removes the user's Brevo marketing contact. Built from env creds;
 * when absent, the Noop notifier no-ops. Lazy-bound to avoid a static auth→leads
 * dep. The use case calls `removeContact(email)` best-effort.
 */
const brevoRemovalProxy: MarketingContactRemovalPort = {
  async removeContact(email: string): Promise<unknown> {
    const { BrevoBetaSignupNotifier, NoopBetaSignupNotifier } =
      await import('@modules/leads/adapters/secondary/notifier/brevo-beta-signup.notifier');
    const notifier = env.brevoApiKey
      ? new BrevoBetaSignupNotifier(env.brevoApiKey, env.brevoBetaListId ?? 0)
      : new NoopBetaSignupNotifier();
    return await notifier.removeContact(email);
  },
};

const deleteAccountUseCase = new DeleteAccountUseCase(
  userRepository,
  imageCleanupProxy,
  legacyImageRefLookupProxy,
  audioCleanupProxy,
  brevoRemovalProxy,
);

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

// ─── B3 DSAR export proxies (lazy-bound, read-only) ─────────────────────────

/** UserMemory (chat module). Resolves the active memory service at call time. */
const userMemoryExportProxy: UserMemoryExportPort = {
  async getForUser(userId: number): Promise<UserMemorySource | null> {
    const { getUserMemoryService } = await import('@modules/chat/chat-module');
    const service = getUserMemoryService();
    if (!service) return null;
    return await service.getUserMemory(userId);
  },
};

/** The subject's own audit rows (`actor_id = userId`). */
const auditLogExportProxy: AuditLogExportPort = {
  async listForUser(userId: number): Promise<AuditLogSource[]> {
    const { auditRepository } = await import('@shared/audit');
    return await auditRepository.listForActor(userId);
  },
};

/** message_feedback rows owned by the user. */
const messageFeedbackExportProxy: MessageFeedbackExportPort = {
  async listForUser(userId: number): Promise<MessageFeedbackSource[]> {
    const { getChatRepository } = await import('@modules/chat/chat-module');
    return await getChatRepository().listMessageFeedbackForUser(userId);
  },
};

/** message_reports rows owned by the user (moderator fields excluded, D7). */
const messageReportExportProxy: MessageReportExportPort = {
  async listForUser(userId: number): Promise<MessageReportSource[]> {
    const { getChatRepository } = await import('@modules/chat/chat-module');
    return await getChatRepository().listMessageReportsForUser(userId);
  },
};

/** social_accounts owned by the user (no secrets on the entity). */
const socialAccountExportProxy: SocialAccountExportPort = {
  async listForUser(userId: number): Promise<SocialAccountSource[]> {
    const rows = await socialAccountRepository.findByUserId(userId);
    return rows.map((r) => ({
      provider: r.provider,
      providerUserId: r.providerUserId,
      email: r.email,
      createdAt: r.createdAt,
    }));
  },
};

/** api_keys owned by the user. `hash`/`salt` are stripped downstream by the use case. */
const apiKeyExportProxy: ApiKeyExportPort = {
  async listForUser(userId: number): Promise<ApiKeySource[]> {
    const rows = await apiKeyRepository.findByUserId(userId);
    return rows.map((k) => ({
      id: k.id,
      prefix: k.prefix,
      name: k.name,
      museumId: k.museumId ?? null,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      isActive: k.isActive,
      createdAt: k.createdAt,
    }));
  },
};

const userConsentRepository = new UserConsentRepositoryPg(AppDataSource);

const exportUserDataUseCase = new ExportUserDataUseCase({
  chatDataExport: chatDataExportProxy,
  reviewDataExport: reviewDataExportProxy,
  supportDataExport: supportDataExportProxy,
  userConsentRepository,
  userMemoryExport: userMemoryExportProxy,
  auditLogExport: auditLogExportProxy,
  messageFeedbackExport: messageFeedbackExportProxy,
  messageReportExport: messageReportExportProxy,
  socialAccountExport: socialAccountExportProxy,
  apiKeyExport: apiKeyExportProxy,
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
