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

export { User } from './domain/user/user.entity';
export { UserConsent, CONSENT_SCOPES, CONSENT_SOURCES } from './domain/consent/userConsent.entity';
export type { ConsentScope, ConsentSource } from './domain/consent/userConsent.entity';
export type { IUserConsentRepository } from './domain/consent/userConsent.repository.interface';
export { UserRole } from './domain/user/user-role';
export type { IUserRepository } from './domain/user/user.repository.interface';
export type { IRefreshTokenRepository } from './domain/refresh-token/refresh-token.repository.interface';
export type { ISocialAccountRepository } from './domain/social-account/socialAccount.repository.interface';
export type { ApiKeyRepository } from './domain/api-key/apiKey.repository.interface';
export type {
  SocialTokenVerifier,
  SocialTokenPayload,
  SocialProvider,
} from './domain/ports/social-token-verifier.port';
export type { NonceStore } from './domain/ports/nonce-store.port';
export type {
  ChatDataExportPort,
  UserChatExportData,
  UserExportPayload,
} from './domain/export/exportUserData.types';
