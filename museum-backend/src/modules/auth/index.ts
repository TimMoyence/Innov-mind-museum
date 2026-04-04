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
} from './useCase';

// ── Domain types ─────────────────────────────────────────────────────────────

export { User } from './domain/user.entity';
export { UserRole } from './domain/user-role';
export type { IUserRepository } from './domain/user.repository.interface';
export type { IRefreshTokenRepository } from './domain/refresh-token.repository.interface';
export type { ISocialAccountRepository } from './domain/socialAccount.repository.interface';
export type { ApiKeyRepository } from './domain/apiKey.repository.interface';
export type {
  SocialTokenVerifier,
  SocialTokenPayload,
  SocialProvider,
} from './domain/social-token-verifier.port';
export type {
  ChatDataExportPort,
  UserChatExportData,
  UserExportPayload,
} from './domain/exportUserData.types';
