import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { AuthSessionService } from '@modules/auth/core/useCase/authSession.service';
import type { StoredRefreshTokenRow } from '@modules/auth/adapters/secondary/refresh-token.repository.pg';
import type { User } from '@modules/auth/core/domain/user.entity';
import { env } from '@src/config/env';

jest.mock('@modules/auth/core/useCase/login-rate-limiter', () => ({
  checkLoginRateLimit: jest.fn(),
  recordFailedLogin: jest.fn(),
  clearLoginAttempts: jest.fn(),
}));

import {
  checkLoginRateLimit,
  recordFailedLogin,
  clearLoginAttempts,
} from '@modules/auth/core/useCase/login-rate-limiter';

const mockCheckLoginRateLimit = checkLoginRateLimit as jest.MockedFunction<typeof checkLoginRateLimit>;
const mockRecordFailedLogin = recordFailedLogin as jest.MockedFunction<typeof recordFailedLogin>;
const mockClearLoginAttempts = clearLoginAttempts as jest.MockedFunction<typeof clearLoginAttempts>;

// ── Helpers ────────────────────────────────────────────────────────

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    email: 'user@test.com',
    password: '$2b$12$hashedpassword',
    firstname: 'Test',
    lastname: 'User',
    role: 'visitor',
    museumId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;

const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

const makeStoredToken = (overrides: Partial<StoredRefreshTokenRow> = {}): StoredRefreshTokenRow => ({
  id: 'tok-1',
  userId: 1,
  jti: 'refresh-jti-1',
  familyId: 'family-1',
  tokenHash: 'placeholder-hash',
  issuedAt: new Date(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days future
  rotatedAt: null,
  revokedAt: null,
  reuseDetectedAt: null,
  replacedByTokenId: null,
  createdAt: new Date(),
  ...overrides,
});

const makeMockRepos = () => {
  const userRepo = {
    getUserByEmail: jest.fn(),
    getUserById: jest.fn(),
    registerUser: jest.fn(),
    setResetToken: jest.fn(),
    getUserByResetToken: jest.fn(),
    updatePassword: jest.fn(),
    registerSocialUser: jest.fn(),
    consumeResetTokenAndUpdatePassword: jest.fn(),
    deleteUser: jest.fn(),
    setVerificationToken: jest.fn(),
    verifyEmail: jest.fn(),
  };

  const refreshTokenRepo = {
    findByJti: jest.fn(),
    revokeFamily: jest.fn().mockResolvedValue(undefined),
    revokeByJti: jest.fn().mockResolvedValue(undefined),
    rotate: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn().mockResolvedValue(undefined),
    deleteExpiredTokens: jest.fn().mockResolvedValue(0),
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
  };

  return { userRepo, refreshTokenRepo };
};

const createService = (userRepo?: unknown, refreshTokenRepo?: unknown) => {
  const mocks = makeMockRepos();
  return {
    service: new AuthSessionService(
      (userRepo || mocks.userRepo) as any,
      (refreshTokenRepo || mocks.refreshTokenRepo) as any,
    ),
    userRepo: (userRepo || mocks.userRepo) as ReturnType<typeof makeMockRepos>['userRepo'],
    refreshTokenRepo: (refreshTokenRepo || mocks.refreshTokenRepo) as ReturnType<typeof makeMockRepos>['refreshTokenRepo'],
  };
};

// ── Tests ──────────────────────────────────────────────────────────

describe('AuthSessionService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ================================================================
  // LOGIN
  // ================================================================
  describe('login', () => {
    it('returns tokens and user info for valid credentials', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      const user = makeUser();
      userRepo.getUserByEmail.mockResolvedValue(user);

      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      // Use bcrypt to compare (real bcrypt)
      const hashed = await bcrypt.hash('ValidPass1', 12);
      userRepo.getUserByEmail.mockResolvedValue(makeUser({ password: hashed }));

      const result = await service.login('user@test.com', 'ValidPass1');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.expiresIn).toBeGreaterThan(0);
      expect(result.refreshExpiresIn).toBeGreaterThan(0);
      expect(result.user.id).toBe(1);
      expect(result.user.email).toBe('user@test.com');
      expect(result.user.role).toBe('visitor');
      expect(mockClearLoginAttempts).toHaveBeenCalledWith('user@test.com');
    });

    it('calls clearLoginAttempts after successful login', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      const hashed = await bcrypt.hash('ValidPass1', 4); // fast rounds for test
      userRepo.getUserByEmail.mockResolvedValue(makeUser({ password: hashed }));

      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);
      await service.login('user@test.com', 'ValidPass1');

      expect(mockClearLoginAttempts).toHaveBeenCalledWith('user@test.com');
    });

    it('throws 400 when email is empty', async () => {
      const { service } = createService();

      await expect(service.login('', 'password')).rejects.toMatchObject({
        statusCode: 400,
        message: 'email and password are required',
      });
    });

    it('throws 400 when password is empty', async () => {
      const { service } = createService();

      await expect(service.login('user@test.com', '')).rejects.toMatchObject({
        statusCode: 400,
        message: 'email and password are required',
      });
    });

    it('throws 401 and records failed login when user is not found', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      userRepo.getUserByEmail.mockResolvedValue(null);

      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      await expect(service.login('noone@test.com', 'pass')).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });
      expect(mockRecordFailedLogin).toHaveBeenCalledWith('noone@test.com');
    });

    it('throws 401 when user has null password (social-only account)', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      userRepo.getUserByEmail.mockResolvedValue(makeUser({ password: null }));

      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      await expect(service.login('social@test.com', 'anypass')).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });
    });

    it('throws 401 and records failed login when password is wrong', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      const hashed = await bcrypt.hash('CorrectPass1', 4);
      userRepo.getUserByEmail.mockResolvedValue(makeUser({ password: hashed }));

      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      await expect(service.login('user@test.com', 'WrongPass1')).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });
      expect(mockRecordFailedLogin).toHaveBeenCalledWith('user@test.com');
    });

    it('throws 429 when rate limit is exceeded', async () => {
      const { service } = createService();
      mockCheckLoginRateLimit.mockImplementation(() => {
        throw Object.assign(new Error('Too many login attempts. Please try again later.'), {
          statusCode: 429,
          code: 'TOO_MANY_REQUESTS',
        });
      });

      await expect(service.login('spammer@test.com', 'pass')).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('inserts refresh token into repo on successful login', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      const hashed = await bcrypt.hash('ValidPass1', 4);
      userRepo.getUserByEmail.mockResolvedValue(makeUser({ password: hashed }));

      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);
      await service.login('user@test.com', 'ValidPass1');

      expect(refreshTokenRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          jti: expect.any(String),
          familyId: expect.any(String),
          tokenHash: expect.any(String),
          issuedAt: expect.any(Date),
          expiresAt: expect.any(Date),
        }),
      );
    });
  });

  // ================================================================
  // REFRESH
  // ================================================================
  describe('refresh', () => {
    it('rotates token and returns new session for valid refresh token', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      const user = makeUser();
      userRepo.getUserById.mockResolvedValue(user);

      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      // Issue an initial session to get a real refresh token
      refreshTokenRepo.insert.mockResolvedValue(undefined);
      const hashed = await bcrypt.hash('ValidPass1', 4);
      userRepo.getUserByEmail.mockResolvedValue(makeUser({ password: hashed }));
      const loginResult = await service.login('user@test.com', 'ValidPass1');

      // Extract the jti/familyId from the real refresh token
      const decoded = jwt.verify(loginResult.refreshToken, env.auth.refreshTokenSecret) as any;

      const storedToken = makeStoredToken({
        jti: decoded.jti,
        familyId: decoded.familyId,
        tokenHash: sha256(loginResult.refreshToken),
        userId: 1,
      });
      refreshTokenRepo.findByJti.mockResolvedValue(storedToken);

      const result = await service.refresh(loginResult.refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.id).toBe(1);
      // Should have called rotate (since we have a rotateFrom)
      expect(refreshTokenRepo.rotate).toHaveBeenCalledWith(
        expect.objectContaining({
          currentTokenId: storedToken.id,
          next: expect.objectContaining({
            userId: 1,
            familyId: decoded.familyId,
          }),
        }),
      );
    });

    it('preserves familyId during rotation', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      userRepo.getUserById.mockResolvedValue(makeUser());

      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      // Create initial login
      const hashed = await bcrypt.hash('ValidPass1', 4);
      userRepo.getUserByEmail.mockResolvedValue(makeUser({ password: hashed }));
      const loginResult = await service.login('user@test.com', 'ValidPass1');
      const decoded = jwt.verify(loginResult.refreshToken, env.auth.refreshTokenSecret) as any;

      refreshTokenRepo.findByJti.mockResolvedValue(
        makeStoredToken({
          jti: decoded.jti,
          familyId: decoded.familyId,
          tokenHash: sha256(loginResult.refreshToken),
        }),
      );

      await service.refresh(loginResult.refreshToken);

      const rotateCall = refreshTokenRepo.rotate.mock.calls[0][0];
      expect(rotateCall.next.familyId).toBe(decoded.familyId);
    });

    it('throws 400 when refreshToken is empty', async () => {
      const { service } = createService();

      await expect(service.refresh('')).rejects.toMatchObject({
        statusCode: 400,
        message: 'refreshToken is required',
      });
    });

    it('throws 401 for invalid JWT', async () => {
      const { service } = createService();

      await expect(service.refresh('not-a-jwt')).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_REFRESH_TOKEN',
      });
    });

    it('throws 401 when token is not found in DB', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      // Create a valid JWT that won't be in the DB
      const token = jwt.sign(
        { sub: '1', type: 'refresh', jti: 'missing-jti', familyId: 'fam-1' },
        env.auth.refreshTokenSecret,
        { expiresIn: '30d' },
      );
      refreshTokenRepo.findByJti.mockResolvedValue(null);

      await expect(service.refresh(token)).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_REFRESH_TOKEN',
      });
    });

    it('revokes family on hash mismatch (reuse detection)', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      const token = jwt.sign(
        { sub: '1', type: 'refresh', jti: 'jti-reuse', familyId: 'fam-reuse' },
        env.auth.refreshTokenSecret,
        { expiresIn: '30d' },
      );

      refreshTokenRepo.findByJti.mockResolvedValue(
        makeStoredToken({
          jti: 'jti-reuse',
          familyId: 'fam-reuse',
          tokenHash: 'different-hash-than-actual',
        }),
      );

      await expect(service.refresh(token)).rejects.toMatchObject({
        statusCode: 401,
        code: 'REFRESH_TOKEN_REUSE_DETECTED',
      });
      expect(refreshTokenRepo.revokeFamily).toHaveBeenCalledWith('fam-reuse', true);
    });

    it('revokes family when token is already revoked', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      const token = jwt.sign(
        { sub: '1', type: 'refresh', jti: 'jti-revoked', familyId: 'fam-revoked' },
        env.auth.refreshTokenSecret,
        { expiresIn: '30d' },
      );

      refreshTokenRepo.findByJti.mockResolvedValue(
        makeStoredToken({
          jti: 'jti-revoked',
          familyId: 'fam-revoked',
          tokenHash: sha256(token),
          revokedAt: new Date(),
        }),
      );

      await expect(service.refresh(token)).rejects.toMatchObject({
        statusCode: 401,
        code: 'REFRESH_TOKEN_REUSE_DETECTED',
      });
      expect(refreshTokenRepo.revokeFamily).toHaveBeenCalledWith('fam-revoked', true);
    });

    it('revokes by jti when token is expired', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      // Create a JWT that's not yet expired in JWT terms but expired in DB
      const token = jwt.sign(
        { sub: '1', type: 'refresh', jti: 'jti-expired', familyId: 'fam-expired' },
        env.auth.refreshTokenSecret,
        { expiresIn: '30d' },
      );

      refreshTokenRepo.findByJti.mockResolvedValue(
        makeStoredToken({
          jti: 'jti-expired',
          familyId: 'fam-expired',
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
        }),
      );

      await expect(service.refresh(token)).rejects.toMatchObject({
        statusCode: 401,
        code: 'REFRESH_TOKEN_EXPIRED',
      });
      expect(refreshTokenRepo.revokeByJti).toHaveBeenCalledWith('jti-expired');
    });

    it('revokes family when user is deleted', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      userRepo.getUserById.mockResolvedValue(null);

      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      const token = jwt.sign(
        { sub: '999', type: 'refresh', jti: 'jti-nousers', familyId: 'fam-nousers' },
        env.auth.refreshTokenSecret,
        { expiresIn: '30d' },
      );

      refreshTokenRepo.findByJti.mockResolvedValue(
        makeStoredToken({
          jti: 'jti-nousers',
          familyId: 'fam-nousers',
          tokenHash: sha256(token),
        }),
      );

      await expect(service.refresh(token)).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_REFRESH_TOKEN',
      });
      expect(refreshTokenRepo.revokeFamily).toHaveBeenCalledWith('fam-nousers');
    });

    it('detects reuse when token was already rotated', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      const token = jwt.sign(
        { sub: '1', type: 'refresh', jti: 'jti-rotated', familyId: 'fam-rotated' },
        env.auth.refreshTokenSecret,
        { expiresIn: '30d' },
      );

      refreshTokenRepo.findByJti.mockResolvedValue(
        makeStoredToken({
          jti: 'jti-rotated',
          familyId: 'fam-rotated',
          tokenHash: sha256(token),
          rotatedAt: new Date(), // already rotated
        }),
      );

      await expect(service.refresh(token)).rejects.toMatchObject({
        statusCode: 401,
        code: 'REFRESH_TOKEN_REUSE_DETECTED',
      });
      expect(refreshTokenRepo.revokeFamily).toHaveBeenCalledWith('fam-rotated', true);
    });
  });

  // ================================================================
  // LOGOUT
  // ================================================================
  describe('logout', () => {
    it('revokes token on valid refresh token', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      const token = jwt.sign(
        { sub: '1', type: 'refresh', jti: 'jti-logout', familyId: 'fam-logout' },
        env.auth.refreshTokenSecret,
        { expiresIn: '30d' },
      );

      await service.logout(token);

      expect(refreshTokenRepo.revokeByJti).toHaveBeenCalledWith('jti-logout');
    });

    it('returns silently when token is empty', async () => {
      const { service, refreshTokenRepo } = createService();

      await service.logout('');

      expect(refreshTokenRepo.revokeByJti).not.toHaveBeenCalled();
    });

    it('returns silently when token is undefined', async () => {
      const { service, refreshTokenRepo } = createService();

      await service.logout(undefined);

      expect(refreshTokenRepo.revokeByJti).not.toHaveBeenCalled();
    });

    it('catches silently when JWT is invalid', async () => {
      const { service, refreshTokenRepo } = createService();

      // Should NOT throw
      await service.logout('not-a-valid-jwt');

      expect(refreshTokenRepo.revokeByJti).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // VERIFY ACCESS TOKEN
  // ================================================================
  describe('verifyAccessToken', () => {
    it('returns { id, role, museumId } for a valid access token', () => {
      const { service } = createService();

      const token = jwt.sign(
        { sub: '42', type: 'access', jti: 'at-jti', role: 'admin', museumId: 5 },
        env.auth.accessTokenSecret,
        { expiresIn: '15m' },
      );

      const result = service.verifyAccessToken(token);

      expect(result).toEqual({ id: 42, role: 'admin', museumId: 5 });
    });

    it('returns museumId null when not present in token', () => {
      const { service } = createService();

      const token = jwt.sign(
        { sub: '1', type: 'access', jti: 'at-jti-2', role: 'visitor' },
        env.auth.accessTokenSecret,
        { expiresIn: '15m' },
      );

      const result = service.verifyAccessToken(token);

      expect(result).toEqual({ id: 1, role: 'visitor', museumId: null });
    });

    it('defaults role to visitor when not present', () => {
      const { service } = createService();

      const token = jwt.sign(
        { sub: '1', type: 'access', jti: 'at-jti-3' },
        env.auth.accessTokenSecret,
        { expiresIn: '15m' },
      );

      const result = service.verifyAccessToken(token);

      expect(result.role).toBe('visitor');
    });

    it('throws 401 for invalid access token', () => {
      const { service } = createService();

      expect(() => service.verifyAccessToken('garbage')).toThrow(
        expect.objectContaining({ statusCode: 401, code: 'INVALID_ACCESS_TOKEN' }),
      );
    });

    it('throws 401 for expired access token', () => {
      const { service } = createService();

      const token = jwt.sign(
        { sub: '1', type: 'access', jti: 'at-jti-exp' },
        env.auth.accessTokenSecret,
        { expiresIn: '0s' },
      );

      // Token is immediately expired
      expect(() => service.verifyAccessToken(token)).toThrow(
        expect.objectContaining({ statusCode: 401, code: 'INVALID_ACCESS_TOKEN' }),
      );
    });

    it('throws 401 when type is not "access"', () => {
      const { service } = createService();

      const token = jwt.sign(
        { sub: '1', type: 'refresh', jti: 'at-jti-wrong' },
        env.auth.accessTokenSecret,
        { expiresIn: '15m' },
      );

      expect(() => service.verifyAccessToken(token)).toThrow(
        expect.objectContaining({ statusCode: 401, code: 'INVALID_ACCESS_TOKEN' }),
      );
    });

    it('throws 401 when sub is missing', () => {
      const { service } = createService();

      const token = jwt.sign(
        { type: 'access', jti: 'at-jti-nosub' },
        env.auth.accessTokenSecret,
        { expiresIn: '15m' },
      );

      expect(() => service.verifyAccessToken(token)).toThrow(
        expect.objectContaining({ statusCode: 401, code: 'INVALID_ACCESS_TOKEN' }),
      );
    });

    it('throws 401 when signed with wrong secret', () => {
      const { service } = createService();

      const token = jwt.sign(
        { sub: '1', type: 'access', jti: 'at-jti-wrong-secret' },
        'wrong-secret',
        { expiresIn: '15m' },
      );

      expect(() => service.verifyAccessToken(token)).toThrow(
        expect.objectContaining({ statusCode: 401, code: 'INVALID_ACCESS_TOKEN' }),
      );
    });
  });

  // ================================================================
  // SOCIAL LOGIN
  // ================================================================
  describe('socialLogin', () => {
    it('issues session and returns tokens + user info', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      const result = await service.socialLogin({
        id: 7,
        email: 'social@test.com',
        firstname: 'Social',
        lastname: 'User',
        role: 'visitor',
      });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.id).toBe(7);
      expect(result.user.email).toBe('social@test.com');
      expect(refreshTokenRepo.insert).toHaveBeenCalled();
    });

    it('fires deleteExpiredTokens asynchronously without blocking', async () => {
      const { userRepo, refreshTokenRepo } = makeMockRepos();
      refreshTokenRepo.deleteExpiredTokens.mockRejectedValue(new Error('DB error'));

      const service = new AuthSessionService(userRepo as any, refreshTokenRepo as any);

      // Should NOT throw even if deleteExpiredTokens fails
      const result = await service.socialLogin({
        id: 1,
        email: 'social@test.com',
        role: 'visitor',
      });

      expect(result.accessToken).toBeDefined();
    });
  });
});
