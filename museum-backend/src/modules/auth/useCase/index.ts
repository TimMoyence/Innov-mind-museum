import { AppDataSource } from '@data/db/data-source';
import { RefreshTokenRepositoryPg } from '@modules/auth/adapters/secondary/pg/refresh-token.repository.pg';
import { SocialAccountRepositoryPg } from '@modules/auth/adapters/secondary/pg/social-account.repository.pg';
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
import { auditService } from '@shared/audit';
import { BrevoEmailService } from '@shared/email/brevo-email.service';
import { TestEmailService } from '@shared/email/test-email-service';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type {
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
  LeadErasurePort,
  MarketingContactRemovalPort,
  MarketingErasureFallbackPort,
} from '@shared/ports/audio-cleanup.port';

const userRepository = new UserRepositoryPg(AppDataSource);
const socialAccountRepository = new SocialAccountRepositoryPg(AppDataSource);
const socialTokenVerifier = new SocialTokenVerifierAdapter();
const refreshTokenRepository = new RefreshTokenRepositoryPg(AppDataSource);

const testEmailService = env.auth.emailServiceKind === 'test' ? new TestEmailService() : null;

const emailService: EmailService | undefined =
  testEmailService ?? (env.brevoApiKey ? new BrevoEmailService(env.brevoApiKey) : undefined);

export const __testEmailService = testEmailService;

const frontendUrl = env.frontendUrl;

const forgotPasswordUseCase = new ForgotPasswordUseCase(userRepository, emailService, frontendUrl);
const resetPasswordUseCase = new ResetPasswordUseCase(userRepository, refreshTokenRepository);
const authSessionService = new AuthSessionService(userRepository, refreshTokenRepository);
const nonceStore = socialNonceStore;

const socialOtcStore = new InMemorySocialOtcStore<AuthSessionResponse>();

const socialLoginUseCase = new SocialLoginUseCase(
  userRepository,
  socialAccountRepository,
  authSessionService,
  socialTokenVerifier,
  nonceStore,
);

const redeemSocialOtcUseCase = new RedeemSocialOtcUseCase(socialOtcStore);
const imageCleanupProxy: ImageCleanupPort = {
  async deleteByPrefix(userId, legacyFetcher): Promise<void> {
    const { getImageStorage } = await import('@modules/chat/chat-module');
    await getImageStorage().deleteByPrefix(userId, legacyFetcher);
  },
};

const legacyImageRefLookupProxy: LegacyImageRefLookup = {
  async findLegacyImageRefsByUserId(userId: number): Promise<string[]> {
    const { getChatRepository } = await import('@modules/chat/chat-module');
    return await getChatRepository().findLegacyImageRefsByUserId(userId);
  },
};

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
          error: errorMessage(error),
        });
      }
    }
  },
};

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

const marketingErasureFallbackProxy: MarketingErasureFallbackPort = {
  async enqueueBrevoErasure(email: string): Promise<void> {
    const { LeadRepositoryPg } =
      await import('@modules/leads/adapters/secondary/pg/lead.repository.pg');
    const leadRepository = new LeadRepositoryPg(AppDataSource);
    await leadRepository.insertPending({ type: 'brevo_erasure', payload: { email } });
  },
};

const leadErasureProxy: LeadErasurePort = {
  async deleteByEmail(emailNormalized: string): Promise<number> {
    const { LeadRepositoryPg } =
      await import('@modules/leads/adapters/secondary/pg/lead.repository.pg');
    const leadRepository = new LeadRepositoryPg(AppDataSource);
    return await leadRepository.deleteByEmail(emailNormalized);
  },
};

const deleteAccountUseCase = new DeleteAccountUseCase({
  userRepository,
  imageStorage: imageCleanupProxy,
  legacyImageRefLookup: legacyImageRefLookupProxy,
  audioCleanup: audioCleanupProxy,
  brevoRemoval: brevoRemovalProxy,
  marketingErasureFallback: marketingErasureFallbackProxy,
  leadErasure: leadErasureProxy,
});

const chatDataExportProxy: ChatDataExportPort = {
  async getAllUserData(userId: number) {
    const { getChatRepository } = await import('@modules/chat/chat-module');
    return await getChatRepository().exportUserData(userId);
  },
};

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

const userMemoryExportProxy: UserMemoryExportPort = {
  async getForUser(userId: number): Promise<UserMemorySource | null> {
    const { getUserMemoryService } = await import('@modules/chat/chat-module');
    const service = getUserMemoryService();
    if (!service) return null;
    return await service.getUserMemory(userId);
  },
};

const auditLogExportProxy: AuditLogExportPort = {
  async listForUser(userId: number): Promise<AuditLogSource[]> {
    const { auditRepository } = await import('@shared/audit');
    return await auditRepository.listForActor(userId);
  },
};

const messageFeedbackExportProxy: MessageFeedbackExportPort = {
  async listForUser(userId: number): Promise<MessageFeedbackSource[]> {
    const { getChatRepository } = await import('@modules/chat/chat-module');
    return await getChatRepository().listMessageFeedbackForUser(userId);
  },
};

const messageReportExportProxy: MessageReportExportPort = {
  async listForUser(userId: number): Promise<MessageReportSource[]> {
    const { getChatRepository } = await import('@modules/chat/chat-module');
    return await getChatRepository().listMessageReportsForUser(userId);
  },
};

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
});
const getProfileUseCase = new GetProfileUseCase(userRepository);
const changePasswordUseCase = new ChangePasswordUseCase(userRepository, refreshTokenRepository);
const changeEmailUseCase = new ChangeEmailUseCase(userRepository, emailService, frontendUrl);
const confirmEmailChangeUseCase = new ConfirmEmailChangeUseCase(
  userRepository,
  refreshTokenRepository,
);
const verifyEmailUseCase = new VerifyEmailUseCase(userRepository);
const updateContentPreferencesUseCase = new UpdateContentPreferencesUseCase(userRepository);
const updateTtsVoiceUseCase = new UpdateTtsVoiceUseCase(userRepository);
const updateProfilePreferencesUseCase = new UpdateProfilePreferencesUseCase(userRepository);

const grantConsentUseCase = new GrantConsentUseCase(userConsentRepository, auditService);
const revokeConsentUseCase = new RevokeConsentUseCase(userConsentRepository, auditService);

const registerUseCase = new RegisterUseCase(
  userRepository,
  emailService,
  frontendUrl,
  grantConsentUseCase,
);

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
  updateContentPreferencesUseCase,
  updateTtsVoiceUseCase,
  updateProfilePreferencesUseCase,
  completeOnboarding,
  grantConsentUseCase,
  revokeConsentUseCase,
  userConsentRepository,
  userRepository,
};
