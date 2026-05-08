import crypto from 'node:crypto';

import bcrypt from 'bcrypt';
import type { DataSource, Repository, UpdateResult } from 'typeorm';

import { User } from '@modules/auth/domain/user/user.entity';
import { AppError } from '@shared/errors/app.error';

import { UserRepositoryPg } from '@modules/auth/adapters/secondary/pg/user.repository.pg';
import { makeUser } from 'tests/helpers/auth/user.fixtures';
import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';
import { makeMockTypeOrmRepo } from 'tests/helpers/shared/mock-deps';

// ─── Mock bcrypt ───
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$hashed_result'),
}));

// ─── TypeORM repo + DataSource mock factory ───
function buildMocks() {
  const qb = makeMockQb();
  const { repo } = makeMockTypeOrmRepo<User>({ qb });

  const txQb = makeMockQb();
  const txManager = { createQueryBuilder: jest.fn(() => txQb) };

  const dataSource = {
    getRepository: jest.fn().mockReturnValue(repo),
    transaction: jest.fn((cb: (manager: unknown) => Promise<void>) => cb(txManager)),
  } as unknown as import('typeorm').DataSource;

  return { repo, qb, dataSource, txManager, txQb };
}

describe('UserRepositoryPg', () => {
  let sut: UserRepositoryPg;
  let repo: jest.Mocked<Repository<User>>;
  let qb: ReturnType<typeof makeMockQb>;
  let dataSource: DataSource;
  let txManager: { createQueryBuilder: jest.Mock };
  let txQb: ReturnType<typeof makeMockQb>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = buildMocks();
    repo = mocks.repo;
    qb = mocks.qb;
    dataSource = mocks.dataSource;
    txManager = mocks.txManager;
    txQb = mocks.txQb;
    sut = new UserRepositoryPg(dataSource);
  });

  // ─── getUserByEmail ───
  describe('getUserByEmail', () => {
    it('returns user when found', async () => {
      const user = makeUser();
      repo.findOne.mockResolvedValue(user);

      const result = await sut.getUserByEmail('user@test.com');

      expect(result).toBe(user);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { email: 'user@test.com' } });
    });

    it('returns null when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await sut.getUserByEmail('unknown@test.com');

      expect(result).toBeNull();
    });
  });

  // ─── getUserById ───
  describe('getUserById', () => {
    it('returns user when found', async () => {
      const user = makeUser({ id: 42 });
      repo.findOne.mockResolvedValue(user);

      const result = await sut.getUserById(42);

      expect(result).toBe(user);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 42 } });
    });

    it('returns null when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await sut.getUserById(999);

      expect(result).toBeNull();
    });
  });

  // ─── registerUser ───
  describe('registerUser', () => {
    it('hashes password, creates and saves user', async () => {
      repo.findOne.mockResolvedValue(null); // no existing user
      const created = makeUser({ email: 'new@test.com' });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await sut.registerUser('new@test.com', 'plaintext123', 'Jane', 'Doe');

      expect(bcrypt.hash).toHaveBeenCalledWith('plaintext123', 12);
      expect(repo.create).toHaveBeenCalledWith({
        email: 'new@test.com',
        password: '$2b$12$hashed_result',
        firstname: 'Jane',
        lastname: 'Doe',
      });
      expect(repo.save).toHaveBeenCalledWith(created);
      expect(result).toBe(created);
    });

    it('throws conflict when email already exists', async () => {
      repo.findOne.mockResolvedValue(makeUser());

      await expect(sut.registerUser('user@test.com', 'pass')).rejects.toThrow(AppError);
      await expect(sut.registerUser('user@test.com', 'pass')).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    // Stryker survivor: ConditionalExpression `if (existingUser)` -> `if (!existingUser)`.
    // Asserts that when an existing user IS found we throw AND we never reach
    // create/save — flipping the condition would proceed to create() and pass
    // a weak "throws" check otherwise.
    it('does not create or save user when email already exists', async () => {
      repo.findOne.mockResolvedValue(makeUser({ email: 'taken@test.com' }));

      await expect(sut.registerUser('taken@test.com', 'pass', 'Jane', 'Doe')).rejects.toMatchObject(
        {
          statusCode: 409,
          code: 'CONFLICT',
        },
      );

      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });

    // Stryker survivor companion: when no existing user, creation MUST proceed.
    // Mirrors the "happy path" but explicitly contrasts the negative branch
    // above so the conditional cannot be flipped without one of the two
    // assertions failing.
    it('proceeds to create + save when no existing user is found', async () => {
      repo.findOne.mockResolvedValue(null);
      const created = makeUser({ email: 'fresh@test.com' });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      await sut.registerUser('fresh@test.com', 'plaintext');

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('handles optional firstname/lastname as undefined', async () => {
      repo.findOne.mockResolvedValue(null);
      const created = makeUser();
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      await sut.registerUser('new@test.com', 'pass');

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firstname: undefined,
          lastname: undefined,
        }),
      );
    });
  });

  // ─── setResetToken ───
  describe('setResetToken', () => {
    it('updates user with token and expiry, returns updated user', async () => {
      const expires = new Date('2026-12-31');
      const user = makeUser({ reset_token: 'tok', reset_token_expires: expires });
      repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      repo.findOne.mockResolvedValue(user);

      const result = await sut.setResetToken('user@test.com', 'tok', expires);

      expect(repo.update).toHaveBeenCalledWith(
        { email: 'user@test.com' },
        { reset_token: 'tok', reset_token_expires: expires },
      );
      expect(result).toBe(user);
    });

    it('throws if user not found after update', async () => {
      repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      repo.findOne.mockResolvedValue(null);

      await expect(sut.setResetToken('gone@test.com', 'tok', new Date())).rejects.toThrow(
        'User not found after update',
      );
    });
  });

  // ─── getUserByResetToken ───
  describe('getUserByResetToken', () => {
    it('finds user by non-expired reset token', async () => {
      const user = makeUser();
      repo.findOne.mockResolvedValue(user);

      const result = await sut.getUserByResetToken('reset-tok');

      expect(result).toBe(user);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: {
          reset_token: 'reset-tok',
          reset_token_expires: expect.objectContaining({ _type: 'moreThan' }),
        },
      });
    });

    it('returns null when token not found or expired', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await sut.getUserByResetToken('expired-tok');

      expect(result).toBeNull();
    });

    // Stryker survivor: EqualityOperator `MoreThan(new Date())` -> `MoreThanOrEqual`.
    // With fake timers we freeze "now" so the FindOperator value is pinned to
    // the exact same Date passed to MoreThan. Asserting `_type === 'moreThan'`
    // (not 'moreThanOrEqual') AND that `_value` strictly equals the frozen
    // `now` makes the mutation fail: a `MoreThanOrEqual` would carry
    // `_type === 'moreThanOrEqual'`, which differs from our equality check.
    it('passes MoreThan(now) — boundary token (expires === now) is rejected', async () => {
      jest.useFakeTimers();
      try {
        const now = new Date('2026-05-09T12:00:00.000Z');
        jest.setSystemTime(now);

        repo.findOne.mockResolvedValue(null);

        await sut.getUserByResetToken('reset-tok');

        const call = repo.findOne.mock.calls[0]?.[0] as unknown as {
          where: {
            reset_token: string;
            reset_token_expires: { _type: string; _value: Date };
          };
        };
        expect(call.where.reset_token).toBe('reset-tok');
        // Strict operator type: MoreThanOrEqual would expose 'moreThanOrEqual'.
        expect(call.where.reset_token_expires._type).toBe('moreThan');
        expect(call.where.reset_token_expires._type).not.toBe('moreThanOrEqual');
        // Value pinned to the frozen "now" — a token whose `expires` equals
        // `now` would NOT satisfy `MoreThan(now)` (strict >), confirming the
        // exact-boundary token is rejected.
        expect(call.where.reset_token_expires._value).toEqual(now);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ─── updatePassword ───
  describe('updatePassword', () => {
    it('hashes new password, clears reset token, returns user', async () => {
      const user = makeUser({ id: 5 });
      repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      repo.findOne.mockResolvedValue(user);

      const result = await sut.updatePassword(5, 'newPassword');

      expect(bcrypt.hash).toHaveBeenCalledWith('newPassword', 12);
      expect(repo.update).toHaveBeenCalledWith(5, {
        password: '$2b$12$hashed_result',
        reset_token: undefined,
        reset_token_expires: undefined,
      });
      expect(result).toBe(user);
    });

    it('throws if user not found after update', async () => {
      repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      repo.findOne.mockResolvedValue(null);

      await expect(sut.updatePassword(999, 'pass')).rejects.toThrow('User not found after update');
    });
  });

  // ─── consumeResetTokenAndUpdatePassword ───
  describe('consumeResetTokenAndUpdatePassword', () => {
    it('updates password and clears token via query builder, returns user', async () => {
      const user = makeUser();
      qb.execute.mockResolvedValue({ raw: [user] });

      const result = await sut.consumeResetTokenAndUpdatePassword('tok', '$2b$12$newhash');

      expect(qb.update).toHaveBeenCalledWith(User);
      expect(qb.set).toHaveBeenCalledWith({
        password: '$2b$12$newhash',
        reset_token: undefined,
        reset_token_expires: undefined,
      });
      expect(qb.where).toHaveBeenCalledWith(
        'reset_token = :token AND reset_token_expires > NOW()',
        { token: 'tok' },
      );
      expect(qb.returning).toHaveBeenCalledWith('*');
      expect(result).toBe(user);
    });

    it('returns null when no row matched (invalid/expired token)', async () => {
      qb.execute.mockResolvedValue({ raw: [] });

      const result = await sut.consumeResetTokenAndUpdatePassword('bad-tok', '$2b$12$hash');

      expect(result).toBeNull();
    });

    it('returns null when raw is undefined', async () => {
      qb.execute.mockResolvedValue({ raw: undefined });

      const result = await sut.consumeResetTokenAndUpdatePassword('bad-tok', '$2b$12$hash');

      expect(result).toBeNull();
    });

    // Stryker survivor: EqualityOperator on the raw SQL `reset_token_expires > NOW()`.
    // A mutation flipping `>` -> `>=` would accept a token whose expiry equals
    // NOW() (the exact boundary). We pin the SQL string AND explicitly forbid
    // `>=` so any operator mutation breaks at least one assertion.
    it('uses strict `> NOW()` (not `>= NOW()`) — boundary token rejected', async () => {
      const user = makeUser();
      qb.execute.mockResolvedValue({ raw: [user] });

      await sut.consumeResetTokenAndUpdatePassword('tok', '$2b$12$newhash');

      // Capture SQL fragment + parameter binding from the qb spy.
      const whereCall = qb.where.mock.calls[0] as [string, { token: string }];
      const sql = whereCall[0];
      const params = whereCall[1];

      expect(sql).toBe('reset_token = :token AND reset_token_expires > NOW()');
      // Defense in depth — operator mutation would inject `>=`.
      expect(sql).toMatch(/reset_token_expires\s+>\s+NOW\(\)/);
      expect(sql).not.toMatch(/reset_token_expires\s+>=\s+NOW\(\)/);
      expect(params).toEqual({ token: 'tok' });
    });
  });

  // ─── setVerificationToken ───
  describe('setVerificationToken', () => {
    it('updates user with verification token and expiry', async () => {
      const expires = new Date('2026-06-01');
      repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

      await sut.setVerificationToken(7, 'verify-tok', expires);

      expect(repo.update).toHaveBeenCalledWith(7, {
        verification_token: 'verify-tok',
        verification_token_expires: expires,
      });
    });
  });

  // ─── verifyEmail ───
  describe('verifyEmail', () => {
    it('sets email_verified=true and clears verification token, returns user', async () => {
      const user = makeUser({ email_verified: true });
      qb.execute.mockResolvedValue({ raw: [user] });

      // SEC (H2): caller must SHA-256-hash the raw token before calling verifyEmail.
      const hashedToken = crypto.createHash('sha256').update('verify-tok').digest('hex');
      const result = await sut.verifyEmail(hashedToken);

      expect(qb.update).toHaveBeenCalledWith(User);
      // `verification_token` and `verification_token_expires` are passed as
      // `() => 'NULL'` raw expressions so TypeORM emits `SET ... = NULL`.
      // Asserting object shape with function references doesn't survive the
      // `toEqual` strict comparison; assert payload structure + the NULL
      // emission contract via `.mock.calls[0][0]`.
      expect(qb.set).toHaveBeenCalledTimes(1);
      const setArg = qb.set.mock.calls[0][0] as {
        email_verified: boolean;
        verification_token: () => string;
        verification_token_expires: () => string;
      };
      expect(setArg.email_verified).toBe(true);
      expect(typeof setArg.verification_token).toBe('function');
      expect(setArg.verification_token()).toBe('NULL');
      expect(typeof setArg.verification_token_expires).toBe('function');
      expect(setArg.verification_token_expires()).toBe('NULL');
      expect(qb.where).toHaveBeenCalledWith(
        'verification_token = :hashedToken AND verification_token_expires > NOW()',
        { hashedToken },
      );
      expect(result).toBe(user);
    });

    it('returns null when token is invalid', async () => {
      qb.execute.mockResolvedValue({ raw: [] });

      const hashedToken = crypto.createHash('sha256').update('bad-tok').digest('hex');
      const result = await sut.verifyEmail(hashedToken);

      expect(result).toBeNull();
    });
  });

  // ─── registerSocialUser ───
  describe('registerSocialUser', () => {
    it('creates user without password, email_verified=true', async () => {
      const user = makeUser({ password: null, email_verified: true });
      repo.create.mockReturnValue(user);
      repo.save.mockResolvedValue(user);

      const result = await sut.registerSocialUser('social@test.com', 'Jane', 'Doe');

      expect(repo.create).toHaveBeenCalledWith({
        email: 'social@test.com',
        password: null,
        firstname: 'Jane',
        lastname: 'Doe',
        email_verified: true,
      });
      expect(result).toBe(user);
    });

    it('handles missing firstname/lastname', async () => {
      const user = makeUser({ password: null });
      repo.create.mockReturnValue(user);
      repo.save.mockResolvedValue(user);

      await sut.registerSocialUser('social@test.com');

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firstname: undefined,
          lastname: undefined,
        }),
      );
    });
  });

  // ─── setEmailChangeToken ───
  describe('setEmailChangeToken', () => {
    it('stores email change token, pending email, and expiry', async () => {
      const expires = new Date('2026-06-15');
      repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

      await sut.setEmailChangeToken(3, 'hashed-tok', 'new@test.com', expires);

      expect(repo.update).toHaveBeenCalledWith(3, {
        email_change_token: 'hashed-tok',
        pending_email: 'new@test.com',
        email_change_token_expiry: expires,
      });
    });
  });

  // ─── consumeEmailChangeToken ───
  describe('consumeEmailChangeToken', () => {
    it('updates email from pending_email and clears token fields', async () => {
      const user = makeUser({ email: 'new@test.com' });
      qb.execute.mockResolvedValue({ raw: [user] });

      const result = await sut.consumeEmailChangeToken('hashed-tok');

      expect(qb.update).toHaveBeenCalledWith(User);
      expect(qb.set).toHaveBeenCalledWith({
        email: expect.any(Function),
        pending_email: undefined,
        email_change_token: undefined,
        email_change_token_expiry: undefined,
      });
      expect(qb.where).toHaveBeenCalledWith(
        'email_change_token = :hashedToken AND email_change_token_expiry > NOW()',
        { hashedToken: 'hashed-tok' },
      );
      expect(result).toBe(user);
    });

    it('returns null when token not found', async () => {
      qb.execute.mockResolvedValue({ raw: undefined });

      const result = await sut.consumeEmailChangeToken('bad-tok');

      expect(result).toBeNull();
    });

    // Stryker survivor: EqualityOperator on the raw SQL
    // `email_change_token_expiry > NOW()`. A `>` -> `>=` mutation would
    // accept an exact-boundary token. Same dual assertion pattern as
    // consumeResetTokenAndUpdatePassword.
    it('uses strict `> NOW()` (not `>= NOW()`) — boundary email-change token rejected', async () => {
      const user = makeUser({ email: 'new@test.com' });
      qb.execute.mockResolvedValue({ raw: [user] });

      await sut.consumeEmailChangeToken('hashed-tok');

      const whereCall = qb.where.mock.calls[0] as [string, { hashedToken: string }];
      const sql = whereCall[0];
      const params = whereCall[1];

      expect(sql).toBe('email_change_token = :hashedToken AND email_change_token_expiry > NOW()');
      expect(sql).toMatch(/email_change_token_expiry\s+>\s+NOW\(\)/);
      expect(sql).not.toMatch(/email_change_token_expiry\s+>=\s+NOW\(\)/);
      expect(params).toEqual({ hashedToken: 'hashed-tok' });
    });
  });

  // ─── markOnboardingCompleted ───
  describe('markOnboardingCompleted', () => {
    it('updates onboarding_completed to true', async () => {
      repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

      await sut.markOnboardingCompleted(10);

      expect(repo.update).toHaveBeenCalledWith(10, { onboarding_completed: true });
    });
  });

  // ─── deleteUser ───
  describe('deleteUser', () => {
    it('deletes chat sessions and user in a transaction', async () => {
      txQb.execute.mockResolvedValue({ affected: 1 });

      await sut.deleteUser(5);

      expect(dataSource.transaction).toHaveBeenCalled();
      // Two delete calls: one for chat_sessions, one for User
      expect(txManager.createQueryBuilder).toHaveBeenCalledTimes(2);
      expect(txQb.delete).toHaveBeenCalledTimes(2);
      expect(txQb.from).toHaveBeenCalledWith('chat_sessions');
      expect(txQb.from).toHaveBeenCalledWith(User);
      expect(txQb.where).toHaveBeenCalledWith('"userId" = :userId', { userId: 5 });
      expect(txQb.where).toHaveBeenCalledWith('id = :userId', { userId: 5 });
    });
  });
});
