import bcrypt from 'bcrypt';
import type { DataSource, Repository, UpdateResult } from 'typeorm';

import { User } from '@modules/auth/core/domain/user.entity';
import { AppError } from '@shared/errors/app.error';

import { UserRepositoryPg } from '@modules/auth/adapters/secondary/user.repository.pg';
import { makeUser } from 'tests/helpers/auth/user.fixtures';

// ─── Mock bcrypt ───
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$hashed_result'),
}));

// ─── QueryBuilder mock factory ───
function makeMockQb() {
  const qb: Record<string, jest.Mock> = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn(),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
  };
  return qb;
}

// ─── TypeORM repo + DataSource mock factory ───
function buildMocks() {
  const qb = makeMockQb();

  const repo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  } as unknown as jest.Mocked<Repository<User>>;

  const txQb = makeMockQb();
  const txManager = {
    createQueryBuilder: jest.fn(() => txQb),
  };

  const dataSource = {
    getRepository: jest.fn().mockReturnValue(repo),
    transaction: jest.fn((cb: (manager: unknown) => Promise<void>) => cb(txManager)),
  } as unknown as DataSource;

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

      const result = await sut.verifyEmail('verify-tok');

      expect(qb.update).toHaveBeenCalledWith(User);
      expect(qb.set).toHaveBeenCalledWith({
        email_verified: true,
        verification_token: undefined,
        verification_token_expires: undefined,
      });
      expect(qb.where).toHaveBeenCalledWith(
        'verification_token = :token AND verification_token_expires > NOW()',
        { token: 'verify-tok' },
      );
      expect(result).toBe(user);
    });

    it('returns null when token is invalid', async () => {
      qb.execute.mockResolvedValue({ raw: [] });

      const result = await sut.verifyEmail('bad-tok');

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
