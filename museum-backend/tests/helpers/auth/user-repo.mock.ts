import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type { IRefreshTokenRepository } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';
import type { ISocialAccountRepository } from '@modules/auth/domain/social-account/socialAccount.repository.interface';
import type { AuthSessionService } from '@modules/auth/useCase/session/authSession.service';
import type { AuthSessionResponse } from '@modules/auth/useCase/session/authSession.service';
import type { User } from '@modules/auth/domain/user/user.entity';

/**
 * Creates a fully mocked IUserRepository.
 *
 * By default, `getUserById` and `getUserByEmail` return the given user
 * (with email matching for `getUserByEmail`). Every method is a jest.fn().
 * @param user - The user to return from finder methods (null = not found).
 * @param overrides - Override specific method mocks.
 */
export const makeUserRepo = (
  user: User | null = null,
  overrides: Partial<Record<keyof IUserRepository, jest.Mock>> = {},
): jest.Mocked<IUserRepository> => {
  const repo: jest.Mocked<IUserRepository> = {
    getUserByEmail: jest.fn().mockResolvedValue(user),
    getUserById: jest.fn().mockResolvedValue(user),
    registerUser: jest.fn().mockResolvedValue(user),
    setResetToken: jest.fn().mockResolvedValue(user),
    getUserByResetToken: jest.fn().mockResolvedValue(user),
    updatePassword: jest.fn().mockResolvedValue(user),
    registerSocialUser: jest.fn().mockResolvedValue(user),
    consumeResetTokenAndUpdatePassword: jest.fn().mockResolvedValue(user),
    deleteUser: jest.fn().mockResolvedValue(undefined),
    setVerificationToken: jest.fn().mockResolvedValue(undefined),
    verifyEmail: jest.fn().mockResolvedValue(user),
    setEmailChangeToken: jest.fn().mockResolvedValue(undefined),
    consumeEmailChangeToken: jest.fn().mockResolvedValue(user),
    markOnboardingCompleted: jest.fn().mockResolvedValue(undefined),
    updateContentPreferences: jest.fn().mockResolvedValue(undefined),
    updateTtsVoice: jest.fn().mockResolvedValue(undefined),
    setMfaEnrollmentDeadline: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return repo;
};

/**
 * Creates a fully mocked IRefreshTokenRepository.
 *
 * All methods are jest.fn() with sensible defaults.
 * @param overrides - Override specific method mocks.
 */
export const makeRefreshTokenRepo = (
  overrides: Partial<Record<keyof IRefreshTokenRepository, jest.Mock>> = {},
): jest.Mocked<IRefreshTokenRepository> => {
  const repo: jest.Mocked<IRefreshTokenRepository> = {
    insert: jest.fn().mockResolvedValue(undefined),
    findByJti: jest.fn().mockResolvedValue(null),
    rotate: jest.fn().mockResolvedValue(undefined),
    revokeByJti: jest.fn().mockResolvedValue(undefined),
    deleteExpiredTokens: jest.fn().mockResolvedValue(0),
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    revokeFamily: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return repo;
};

export const makeSocialAccountRepo = (
  overrides: Partial<Record<keyof ISocialAccountRepository, jest.Mock>> = {},
): jest.Mocked<ISocialAccountRepository> => {
  const repo: jest.Mocked<ISocialAccountRepository> = {
    findByProviderAndProviderUserId: jest.fn().mockResolvedValue(null),
    findByUserId: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue(null),
    deleteByUserId: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return repo;
};

const defaultSessionResponse: AuthSessionResponse = {
  accessToken: 'access-jwt',
  refreshToken: 'refresh-jwt',
  expiresIn: 900,
  refreshExpiresIn: 2592000,
  user: {
    id: 1,
    email: 'user@test.com',
    firstname: 'Test',
    lastname: 'User',
    role: 'visitor',
    museumId: null,
    onboardingCompleted: false,
  },
};

export const makeAuthSessionServiceMock = (
  sessionResponse: AuthSessionResponse = defaultSessionResponse,
): jest.Mocked<AuthSessionService> =>
  ({
    socialLogin: jest.fn().mockResolvedValue(sessionResponse),
    login: jest.fn().mockResolvedValue(sessionResponse),
    refresh: jest.fn().mockResolvedValue(sessionResponse),
    logout: jest.fn().mockResolvedValue(undefined),
    verifyAccessToken: jest.fn().mockResolvedValue(null),
  }) as unknown as jest.Mocked<AuthSessionService>;
