import { SocialLoginUseCase } from '@modules/auth/core/useCase/socialLogin.useCase';
import type { IUserRepository } from '@modules/auth/core/domain/user.repository.interface';
import type { ISocialAccountRepository } from '@modules/auth/core/domain/socialAccount.repository.interface';
import type { AuthSessionService } from '@modules/auth/core/useCase/authSession.service';
import type { SocialTokenVerifier } from '@modules/auth/core/domain/social-token-verifier.port';
import type { User } from '@modules/auth/core/domain/user.entity';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    email: 'user@test.com',
    password: '$2b$12$hash',
    firstname: 'Test',
    lastname: 'User',
    role: 'visitor',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;

const sessionResponse = {
  accessToken: 'access-jwt',
  refreshToken: 'refresh-jwt',
  expiresIn: 900,
  refreshExpiresIn: 2592000,
  user: {
    id: 1,
    email: 'user@test.com',
    firstname: 'Test',
    lastname: 'User',
    role: 'visitor' as const,
    museumId: null,
  },
};

const makeMocks = () => {
  const userRepo: jest.Mocked<
    Pick<IUserRepository, 'getUserById' | 'getUserByEmail' | 'registerSocialUser'>
  > = {
    getUserById: jest.fn(),
    getUserByEmail: jest.fn(),
    registerSocialUser: jest.fn(),
  };

  const socialAccountRepo: jest.Mocked<
    Pick<ISocialAccountRepository, 'findByProviderAndProviderUserId' | 'create'>
  > = {
    findByProviderAndProviderUserId: jest.fn(),
    create: jest.fn(),
  };

  const authSessionService = {
    socialLogin: jest.fn().mockResolvedValue(sessionResponse),
  } as unknown as AuthSessionService;

  const socialTokenVerifier: jest.Mocked<SocialTokenVerifier> = {
    verify: jest.fn(),
  };

  return { userRepo, socialAccountRepo, authSessionService, socialTokenVerifier };
};

describe('SocialLoginUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Happy paths ──────────────────────────────────────────────────

  it('returns session when user exists via social link', async () => {
    const { userRepo, socialAccountRepo, authSessionService, socialTokenVerifier } = makeMocks();
    const user = makeUser();

    socialAccountRepo.findByProviderAndProviderUserId.mockResolvedValue({
      id: 'sa-1',
      userId: 1,
      provider: 'google',
      providerUserId: 'goog-123',
      email: 'user@test.com',
      createdAt: new Date(),
    });
    userRepo.getUserById.mockResolvedValue(user);
    socialTokenVerifier.verify.mockResolvedValue({
      providerUserId: 'goog-123',
      email: 'user@test.com',
      emailVerified: true,
      firstname: 'Test',
      lastname: 'User',
    });

    const useCase = new SocialLoginUseCase(
      userRepo as unknown as IUserRepository,
      socialAccountRepo as unknown as ISocialAccountRepository,
      authSessionService,
      socialTokenVerifier,
    );

    const result = await useCase.execute('google', 'valid-id-token');

    expect(result).toEqual(sessionResponse);
    expect(socialAccountRepo.findByProviderAndProviderUserId).toHaveBeenCalledWith(
      'google',
      'goog-123',
    );
    expect(authSessionService.socialLogin).toHaveBeenCalled();
  });

  it('links social account when email matches existing user', async () => {
    const { userRepo, socialAccountRepo, authSessionService, socialTokenVerifier } = makeMocks();
    const existingUser = makeUser({ id: 5, email: 'existing@test.com' });

    socialAccountRepo.findByProviderAndProviderUserId.mockResolvedValue(null);
    userRepo.getUserByEmail.mockResolvedValue(existingUser);
    socialAccountRepo.create.mockResolvedValue({
      id: 'sa-2',
      userId: 5,
      provider: 'google',
      providerUserId: 'goog-456',
      email: 'existing@test.com',
      createdAt: new Date(),
    });
    socialTokenVerifier.verify.mockResolvedValue({
      providerUserId: 'goog-456',
      email: 'existing@test.com',
      emailVerified: true,
      firstname: 'Existing',
      lastname: 'User',
    });

    const useCase = new SocialLoginUseCase(
      userRepo as unknown as IUserRepository,
      socialAccountRepo as unknown as ISocialAccountRepository,
      authSessionService,
      socialTokenVerifier,
    );

    const result = await useCase.execute('google', 'valid-token');

    expect(socialAccountRepo.create).toHaveBeenCalledWith({
      userId: 5,
      provider: 'google',
      providerUserId: 'goog-456',
      email: 'existing@test.com',
    });
    expect(authSessionService.socialLogin).toHaveBeenCalled();
    expect(result).toEqual(sessionResponse);
  });

  it('creates new user when no social link and no email match', async () => {
    const { userRepo, socialAccountRepo, authSessionService, socialTokenVerifier } = makeMocks();
    const newUser = makeUser({ id: 10, email: 'new@test.com' });

    socialAccountRepo.findByProviderAndProviderUserId.mockResolvedValue(null);
    userRepo.getUserByEmail.mockResolvedValue(null);
    userRepo.registerSocialUser.mockResolvedValue(newUser);
    socialAccountRepo.create.mockResolvedValue({
      id: 'sa-3',
      userId: 10,
      provider: 'google',
      providerUserId: 'goog-789',
      email: 'new@test.com',
      createdAt: new Date(),
    });
    socialTokenVerifier.verify.mockResolvedValue({
      providerUserId: 'goog-789',
      email: 'new@test.com',
      emailVerified: true,
      firstname: 'New',
      lastname: 'User',
    });

    const useCase = new SocialLoginUseCase(
      userRepo as unknown as IUserRepository,
      socialAccountRepo as unknown as ISocialAccountRepository,
      authSessionService,
      socialTokenVerifier,
    );

    await useCase.execute('google', 'valid-token');

    expect(userRepo.registerSocialUser).toHaveBeenCalledWith('new@test.com', 'New', 'User');
    expect(socialAccountRepo.create).toHaveBeenCalledWith({
      userId: 10,
      provider: 'google',
      providerUserId: 'goog-789',
      email: 'new@test.com',
    });
  });

  // ── Error paths ──────────────────────────────────────────────────

  it('throws 400 when idToken is empty', async () => {
    const { userRepo, socialAccountRepo, authSessionService, socialTokenVerifier } = makeMocks();
    const useCase = new SocialLoginUseCase(
      userRepo as unknown as IUserRepository,
      socialAccountRepo as unknown as ISocialAccountRepository,
      authSessionService,
      socialTokenVerifier,
    );

    await expect(useCase.execute('google', '')).rejects.toMatchObject({
      message: 'idToken is required',
      statusCode: 400,
    });
  });

  it('throws 400 when idToken is whitespace-only', async () => {
    const { userRepo, socialAccountRepo, authSessionService, socialTokenVerifier } = makeMocks();
    const useCase = new SocialLoginUseCase(
      userRepo as unknown as IUserRepository,
      socialAccountRepo as unknown as ISocialAccountRepository,
      authSessionService,
      socialTokenVerifier,
    );

    await expect(useCase.execute('apple', '   ')).rejects.toMatchObject({
      message: 'idToken is required',
      statusCode: 400,
    });
  });

  it('propagates error when token verification fails', async () => {
    const { userRepo, socialAccountRepo, authSessionService, socialTokenVerifier } = makeMocks();
    socialTokenVerifier.verify.mockRejectedValue(new Error('Invalid JWT format'));

    const useCase = new SocialLoginUseCase(
      userRepo as unknown as IUserRepository,
      socialAccountRepo as unknown as ISocialAccountRepository,
      authSessionService,
      socialTokenVerifier,
    );

    await expect(useCase.execute('google', 'invalid-token')).rejects.toThrow('Invalid JWT format');
  });

  it('throws 401 when social link exists but user was deleted', async () => {
    const { userRepo, socialAccountRepo, authSessionService, socialTokenVerifier } = makeMocks();

    socialAccountRepo.findByProviderAndProviderUserId.mockResolvedValue({
      id: 'sa-orphan',
      userId: 999,
      provider: 'google',
      providerUserId: 'goog-orphan',
      email: 'orphan@test.com',
      createdAt: new Date(),
    });
    userRepo.getUserById.mockResolvedValue(null);
    socialTokenVerifier.verify.mockResolvedValue({
      providerUserId: 'goog-orphan',
      email: 'orphan@test.com',
      emailVerified: true,
    });

    const useCase = new SocialLoginUseCase(
      userRepo as unknown as IUserRepository,
      socialAccountRepo as unknown as ISocialAccountRepository,
      authSessionService,
      socialTokenVerifier,
    );

    await expect(useCase.execute('google', 'some-token')).rejects.toMatchObject({
      message: 'User not found',
      statusCode: 401,
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────

  it('does not link by email for Apple private relay addresses', async () => {
    const { userRepo, socialAccountRepo, authSessionService, socialTokenVerifier } = makeMocks();
    const newUser = makeUser({ id: 20, email: 'abc123@privaterelay.appleid.com' });

    socialAccountRepo.findByProviderAndProviderUserId.mockResolvedValue(null);
    userRepo.registerSocialUser.mockResolvedValue(newUser);
    socialAccountRepo.create.mockResolvedValue({
      id: 'sa-pr',
      userId: 20,
      provider: 'apple',
      providerUserId: 'apple-pr-1',
      email: 'abc123@privaterelay.appleid.com',
      createdAt: new Date(),
    });
    socialTokenVerifier.verify.mockResolvedValue({
      providerUserId: 'apple-pr-1',
      email: 'abc123@privaterelay.appleid.com',
      emailVerified: true,
    });

    const useCase = new SocialLoginUseCase(
      userRepo as unknown as IUserRepository,
      socialAccountRepo as unknown as ISocialAccountRepository,
      authSessionService,
      socialTokenVerifier,
    );

    await useCase.execute('apple', 'apple-token');

    // Should NOT call getUserByEmail (no linking attempt)
    expect(userRepo.getUserByEmail).not.toHaveBeenCalled();
    // Should create new user instead
    expect(userRepo.registerSocialUser).toHaveBeenCalled();
  });

  it('does not link by email when emailVerified is false', async () => {
    const { userRepo, socialAccountRepo, authSessionService, socialTokenVerifier } = makeMocks();
    const newUser = makeUser({ id: 21 });

    socialAccountRepo.findByProviderAndProviderUserId.mockResolvedValue(null);
    userRepo.registerSocialUser.mockResolvedValue(newUser);
    socialAccountRepo.create.mockResolvedValue({
      id: 'sa-unver',
      userId: 21,
      provider: 'google',
      providerUserId: 'goog-unver',
      email: 'unverified@test.com',
      createdAt: new Date(),
    });
    socialTokenVerifier.verify.mockResolvedValue({
      providerUserId: 'goog-unver',
      email: 'unverified@test.com',
      emailVerified: false,
    });

    const useCase = new SocialLoginUseCase(
      userRepo as unknown as IUserRepository,
      socialAccountRepo as unknown as ISocialAccountRepository,
      authSessionService,
      socialTokenVerifier,
    );

    await useCase.execute('google', 'some-token');

    // Should NOT attempt linking because email is not verified
    expect(userRepo.getUserByEmail).not.toHaveBeenCalled();
    expect(userRepo.registerSocialUser).toHaveBeenCalled();
  });

  it('generates synthetic email when provider has no email', async () => {
    const { userRepo, socialAccountRepo, authSessionService, socialTokenVerifier } = makeMocks();
    const newUser = makeUser({ id: 30, email: 'apple-no-email@apple.social' });

    socialAccountRepo.findByProviderAndProviderUserId.mockResolvedValue(null);
    userRepo.registerSocialUser.mockResolvedValue(newUser);
    socialAccountRepo.create.mockResolvedValue({
      id: 'sa-noemail',
      userId: 30,
      provider: 'apple',
      providerUserId: 'apple-noemail',
      email: null,
      createdAt: new Date(),
    });
    socialTokenVerifier.verify.mockResolvedValue({
      providerUserId: 'apple-noemail',
      email: null,
      emailVerified: false,
    });

    const useCase = new SocialLoginUseCase(
      userRepo as unknown as IUserRepository,
      socialAccountRepo as unknown as ISocialAccountRepository,
      authSessionService,
      socialTokenVerifier,
    );

    await useCase.execute('apple', 'apple-token');

    expect(userRepo.registerSocialUser).toHaveBeenCalledWith(
      'apple-noemail@apple.social',
      undefined,
      undefined,
    );
    expect(socialAccountRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: undefined }),
    );
  });

  it('normalizes email to lowercase and trimmed', async () => {
    const { userRepo, socialAccountRepo, authSessionService, socialTokenVerifier } = makeMocks();
    const existingUser = makeUser({ id: 40, email: 'mixed@test.com' });

    socialAccountRepo.findByProviderAndProviderUserId.mockResolvedValue(null);
    userRepo.getUserByEmail.mockResolvedValue(existingUser);
    socialAccountRepo.create.mockResolvedValue({
      id: 'sa-norm',
      userId: 40,
      provider: 'google',
      providerUserId: 'goog-norm',
      email: 'mixed@test.com',
      createdAt: new Date(),
    });
    socialTokenVerifier.verify.mockResolvedValue({
      providerUserId: 'goog-norm',
      email: '  Mixed@Test.COM  ',
      emailVerified: true,
    });

    const useCase = new SocialLoginUseCase(
      userRepo as unknown as IUserRepository,
      socialAccountRepo as unknown as ISocialAccountRepository,
      authSessionService,
      socialTokenVerifier,
    );

    await useCase.execute('google', 'some-token');

    expect(userRepo.getUserByEmail).toHaveBeenCalledWith('mixed@test.com');
    expect(socialAccountRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'mixed@test.com' }),
    );
  });

  it('Google private relay is NOT excluded from linking (only Apple is)', async () => {
    const { userRepo, socialAccountRepo, authSessionService, socialTokenVerifier } = makeMocks();
    const existingUser = makeUser({ id: 50, email: 'relay@privaterelay.appleid.com' });

    socialAccountRepo.findByProviderAndProviderUserId.mockResolvedValue(null);
    userRepo.getUserByEmail.mockResolvedValue(existingUser);
    socialAccountRepo.create.mockResolvedValue({
      id: 'sa-google-relay',
      userId: 50,
      provider: 'google',
      providerUserId: 'goog-relay',
      email: 'relay@privaterelay.appleid.com',
      createdAt: new Date(),
    });
    socialTokenVerifier.verify.mockResolvedValue({
      providerUserId: 'goog-relay',
      email: 'relay@privaterelay.appleid.com',
      emailVerified: true,
    });

    const useCase = new SocialLoginUseCase(
      userRepo as unknown as IUserRepository,
      socialAccountRepo as unknown as ISocialAccountRepository,
      authSessionService,
      socialTokenVerifier,
    );

    await useCase.execute('google', 'some-token');

    // Google provider should still attempt linking even with privaterelay domain
    expect(userRepo.getUserByEmail).toHaveBeenCalledWith('relay@privaterelay.appleid.com');
  });

  it('creates social account with null email when provider email is null and user is new', async () => {
    const { userRepo, socialAccountRepo, authSessionService, socialTokenVerifier } = makeMocks();
    const newUser = makeUser({ id: 60 });

    socialAccountRepo.findByProviderAndProviderUserId.mockResolvedValue(null);
    userRepo.registerSocialUser.mockResolvedValue(newUser);
    socialAccountRepo.create.mockResolvedValue({
      id: 'sa-null',
      userId: 60,
      provider: 'apple',
      providerUserId: 'apple-null',
      email: null,
      createdAt: new Date(),
    });
    socialTokenVerifier.verify.mockResolvedValue({
      providerUserId: 'apple-null',
      email: null,
      emailVerified: false,
    });

    const useCase = new SocialLoginUseCase(
      userRepo as unknown as IUserRepository,
      socialAccountRepo as unknown as ISocialAccountRepository,
      authSessionService,
      socialTokenVerifier,
    );

    await useCase.execute('apple', 'some-token');

    // socialAccountRepo.create should be called with email undefined (null?.trim().toLowerCase() is undefined)
    expect(socialAccountRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ providerUserId: 'apple-null' }),
    );
  });
});
