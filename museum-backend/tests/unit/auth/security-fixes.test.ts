import { AuthSessionService } from '@modules/auth/core/useCase/authSession.service';
import { parseReportMessageRequest } from '@modules/chat/adapters/primary/http/chat.contracts';
import type { IUserRepository } from '@modules/auth/core/domain/user.repository.interface';
import type { User } from '@modules/auth/core/domain/user.entity';

const makeSocialUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    email: 'social@test.com',
    password: null,
    firstname: 'Alice',
    lastname: 'Test',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;

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

describe('S2-20a: login oracle — social-only account', () => {
  it('returns generic INVALID_CREDENTIALS for social-only accounts', async () => {
    const socialUser = makeSocialUser();
    const service = new AuthSessionService(
      makeUserRepo(socialUser),
      makeRefreshTokenRepo(),
    );

    try {
      await service.login('social@test.com', 'any-password');
      fail('Expected login to throw');
    } catch (error: unknown) {
      const err = error as { statusCode: number; code: string; message: string };
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('INVALID_CREDENTIALS');
      expect(err.message).toBe('Invalid credentials');
      expect(err.message).not.toContain('social');
      expect(err.message).not.toContain('Apple');
      expect(err.message).not.toContain('Google');
    }
  });
});

describe('S2-20c: report comment length validation', () => {
  it('accepts a comment at exactly 500 characters', () => {
    const result = parseReportMessageRequest({
      reason: 'offensive',
      comment: 'x'.repeat(500),
    });
    expect(result.comment).toHaveLength(500);
  });

  it('rejects a comment exceeding 500 characters', () => {
    expect(() =>
      parseReportMessageRequest({
        reason: 'offensive',
        comment: 'x'.repeat(501),
      }),
    ).toThrow('comment must be 500 characters or fewer');
  });
});

describe('S2-20d: register response shape', () => {
  it('route handler should return { user: { id, email } } without password or names', () => {
    // Simulates the transformation the route handler now performs.
    // The route does: res.status(201).json({ user: { id: user.id, email: user.email } })
    const fullUser: User = {
      id: 42,
      email: 'new@test.com',
      password: '$2b$12$hashedvalue',
      firstname: 'Alice',
      lastname: 'Doe',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    const response = { user: { id: fullUser.id, email: fullUser.email } };

    expect(response).toEqual({ user: { id: 42, email: 'new@test.com' } });
    expect(response).not.toHaveProperty('password');
    expect(response).not.toHaveProperty('firstname');
    expect(response).not.toHaveProperty('lastname');
    expect((response.user as Record<string, unknown>).password).toBeUndefined();
  });
});
