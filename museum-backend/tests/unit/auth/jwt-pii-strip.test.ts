import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { AuthSessionService } from '@modules/auth/useCase/authSession.service';
import { GetProfileUseCase } from '@modules/auth/useCase/getProfile.useCase';
import type { IUserRepository } from '@modules/auth/domain/user.repository.interface';
import type { User } from '@modules/auth/domain/user.entity';
import { makeUser } from '../../helpers/auth/user.fixtures';

jest.mock('bcrypt', () => ({
  ...jest.requireActual('bcrypt'),
  compare: jest.fn(),
}));

// env.ts resolves accessTokenSecret from JWT_ACCESS_SECRET → JWT_SECRET → 'local-dev-jwt-secret'
// We need to read it after the module is loaded to sign test tokens with the same secret.
import { env } from '@src/config/env';

const getAccessSecret = () => env.auth.accessTokenSecret;

const USER_DEFAULTS = {
  id: 42,
  email: 'alice@example.com',
  password: '$2b$12$hashed',
  firstname: 'Alice',
  lastname: 'Doe',
  // login() enforces email_verified — fixture defaults to false, overridden here
  // so the service reaches the session-issuing branch under test.
  email_verified: true,
  onboarding_completed: false,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-06-01'),
} as const;

const makeUserRepo = (user: User | null): IUserRepository =>
  ({
    getUserByEmail: jest.fn().mockResolvedValue(user),
    getUserById: jest.fn().mockResolvedValue(user),
  }) as unknown as IUserRepository;

const makeRefreshTokenRepo = () =>
  ({
    insert: jest.fn().mockResolvedValue(undefined),
    findByJti: jest.fn().mockResolvedValue(null),
    revokeByJti: jest.fn().mockResolvedValue(undefined),
    revokeFamily: jest.fn().mockResolvedValue(undefined),
    rotate: jest.fn().mockResolvedValue(undefined),
    deleteExpiredTokens: jest.fn().mockResolvedValue(0),
  }) as unknown as ConstructorParameters<typeof AuthSessionService>[1];

describe('S2-22: JWT PII strip', () => {
  it('verifyAccessToken returns { id, role } only — no email, firstname, lastname', () => {
    const service = new AuthSessionService(
      makeUserRepo(makeUser(USER_DEFAULTS)),
      makeRefreshTokenRepo(),
    );

    const token = jwt.sign(
      { sub: '42', type: 'access', jti: 'test-jti', role: 'visitor' },
      getAccessSecret(),
      { expiresIn: '15m' },
    );

    const result = service.verifyAccessToken(token);
    expect(result).toEqual({ id: 42, role: 'visitor', museumId: null });
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('firstname');
    expect(result).not.toHaveProperty('lastname');
  });

  it('issued access token contains role but no PII fields when decoded', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const user = makeUser(USER_DEFAULTS);
    const service = new AuthSessionService(makeUserRepo(user), makeRefreshTokenRepo());

    const session = (await service.login('alice@example.com', 'ValidPass1')) as {
      accessToken: string;
    };

    const decoded = jwt.decode(session.accessToken) as Record<string, unknown>;
    expect(decoded.sub).toBe('42');
    expect(decoded.type).toBe('access');
    expect(typeof decoded.jti).toBe('string');
    expect((decoded.jti as string).length).toBeGreaterThan(0);
    expect(decoded.role).toBe('visitor');
    expect(decoded).not.toHaveProperty('email');
    expect(decoded).not.toHaveProperty('firstname');
    expect(decoded).not.toHaveProperty('lastname');
  });

  it('login response body still includes user with PII (SafeUser)', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const user = makeUser(USER_DEFAULTS);
    const service = new AuthSessionService(makeUserRepo(user), makeRefreshTokenRepo());

    const session = (await service.login('alice@example.com', 'ValidPass1')) as {
      user: unknown;
    };
    expect(session.user).toEqual({
      id: 42,
      email: 'alice@example.com',
      firstname: 'Alice',
      lastname: 'Doe',
      role: 'visitor',
      museumId: null,
      onboardingCompleted: false,
    });
  });
});

describe('GetProfileUseCase', () => {
  it('returns full profile for existing user', async () => {
    const user = makeUser(USER_DEFAULTS);
    const useCase = new GetProfileUseCase(makeUserRepo(user));

    const result = await useCase.execute(42);
    expect(result).toEqual({
      id: 42,
      email: 'alice@example.com',
      firstname: 'Alice',
      lastname: 'Doe',
      role: 'visitor',
      onboardingCompleted: false,
      contentPreferences: [],
      // Spec C T2.4 — `ttsVoice` is null when the visitor has not yet picked one.
      ttsVoice: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-06-01'),
    });
  });

  it('returns null for deleted/non-existent user', async () => {
    const useCase = new GetProfileUseCase(makeUserRepo(null));
    const result = await useCase.execute(999);
    expect(result).toBeNull();
  });
});
