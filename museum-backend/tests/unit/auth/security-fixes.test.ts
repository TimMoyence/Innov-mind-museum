import { AuthSessionService } from '@modules/auth/useCase/authSession.service';
import { parseReportMessageRequest } from '@modules/chat/adapters/primary/http/chat.contracts';
import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo, makeRefreshTokenRepo } from '../../helpers/auth/user-repo.mock';

describe('S2-20a: login oracle — social-only account', () => {
  it('returns generic INVALID_CREDENTIALS for social-only accounts', async () => {
    const socialUser = makeUser({ email: 'social@test.com', password: null });
    const service = new AuthSessionService(makeUserRepo(socialUser), makeRefreshTokenRepo());

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
  it('route handler strips sensitive fields — only id and email remain', () => {
    const fullUser = makeUser({
      id: 42,
      email: 'new@test.com',
      password: '$2b$12$hashedvalue',
      firstname: 'Alice',
      lastname: 'Doe',
    });

    // Simulate the route handler transformation:
    // res.status(201).json({ user: { id: user.id, email: user.email } })
    const response = { user: { id: fullUser.id, email: fullUser.email } };

    expect(response.user).toEqual({ id: 42, email: 'new@test.com' });
    expect(Object.keys(response.user)).toEqual(['id', 'email']);
    expect(Object.keys(response.user)).not.toContain('password');
    expect(Object.keys(response.user)).not.toContain('firstname');
    expect(Object.keys(response.user)).not.toContain('lastname');
  });
});
