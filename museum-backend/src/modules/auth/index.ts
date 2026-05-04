/**
 * Auth module barrel.
 * Re-exports use-case singletons and key domain types for cross-module consumption.
 */

// ── Use-case singletons (composition root) ──────────────────────────────────

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
  completeOnboarding,
  grantConsentUseCase,
  revokeConsentUseCase,
  userConsentRepository,
  wireAuthMiddleware,
} from './useCase';

// ── Domain types ─────────────────────────────────────────────────────────────

export { User } from '@modules/auth/domain/user/user.entity';
export {
  UserConsent,
  CONSENT_SCOPES,
  CONSENT_SOURCES,
} from '@modules/auth/domain/consent/userConsent.entity';
export type { ConsentScope, ConsentSource } from '@modules/auth/domain/consent/userConsent.entity';
export type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';
export { UserRole } from '@modules/auth/domain/user/user-role';
export type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
export type { IRefreshTokenRepository } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';
export type { ISocialAccountRepository } from '@modules/auth/domain/social-account/socialAccount.repository.interface';
export type { ApiKeyRepository } from '@modules/auth/domain/api-key/apiKey.repository.interface';
export type {
  SocialTokenVerifier,
  SocialTokenPayload,
  SocialProvider,
} from '@modules/auth/domain/ports/social-token-verifier.port';
export type { NonceStore } from '@modules/auth/domain/ports/nonce-store.port';
export type {
  ChatDataExportPort,
  UserChatExportData,
  UserExportPayload,
} from '@modules/auth/domain/export/exportUserData.types';
