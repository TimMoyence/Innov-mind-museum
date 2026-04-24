import type { DataSource, Repository } from 'typeorm';

import { AuthRefreshToken } from '@modules/auth/domain/authRefreshToken.entity';
import { RefreshTokenRepositoryPg } from '@modules/auth/adapters/secondary/refresh-token.repository.pg';
import { makeUser } from 'tests/helpers/auth/user.fixtures';
import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';
import { makeMockTypeOrmRepo } from 'tests/helpers/shared/mock-deps';

import type { InsertRefreshTokenInput } from '@modules/auth/domain/refresh-token.repository.interface';

// ─── TypeORM repo + DataSource mock factory ───
function buildMocks() {
  const qb = makeMockQb({ execute: jest.fn().mockResolvedValue({ affected: 1 }) });
  const { repo } = makeMockTypeOrmRepo<AuthRefreshToken>({ qb });
  const { repo: txRepo } = makeMockTypeOrmRepo<AuthRefreshToken>();

  const dataSource = {
    getRepository: jest.fn().mockReturnValue(repo),
    transaction: jest.fn(
      (cb: (manager: { getRepository: () => typeof txRepo }) => Promise<unknown>) =>
        cb({ getRepository: () => txRepo }),
    ),
  } as unknown as import('typeorm').DataSource;

  return { repo, qb, dataSource, txRepo };
}

// ─── Fixture helper ───
function makeInsertInput(
  overrides: Partial<InsertRefreshTokenInput> = {},
): InsertRefreshTokenInput {
  return {
    userId: 1,
    jti: 'jti-abc-123',
    familyId: 'family-xyz-789',
    tokenHash: 'sha256-hash-value',
    issuedAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date('2026-01-08T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Build a fake AuthRefreshToken entity with user relation loaded.
 * `userId` is the JoinColumn name — accepted on overrides for fallback scenarios.
 * @param overrides
 */
function makeRefreshTokenEntity(
  overrides: Partial<AuthRefreshToken> & { userId?: number } = {},
): AuthRefreshToken {
  const user = makeUser({ id: 1 });
  return {
    id: 'uuid-token-1',
    user,
    jti: 'jti-abc-123',
    familyId: 'family-xyz-789',
    tokenHash: 'sha256-hash-value',
    issuedAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date('2026-01-08T00:00:00Z'),
    rotatedAt: null,
    lastRotatedAt: null,
    revokedAt: null,
    reuseDetectedAt: null,
    replacedByTokenId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as AuthRefreshToken;
}

describe('RefreshTokenRepositoryPg', () => {
  let sut: RefreshTokenRepositoryPg;
  let repo: jest.Mocked<Repository<AuthRefreshToken>>;
  let qb: ReturnType<typeof makeMockQb>;
  let dataSource: DataSource;
  let txRepo: jest.Mocked<Repository<AuthRefreshToken>>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = buildMocks();
    repo = mocks.repo;
    qb = mocks.qb;
    dataSource = mocks.dataSource;
    txRepo = mocks.txRepo;
    sut = new RefreshTokenRepositoryPg(dataSource);
  });

  // ─── insert ───
  describe('insert', () => {
    it('creates and saves a refresh token, returns StoredRefreshTokenRow', async () => {
      const input = makeInsertInput();
      const saved = makeRefreshTokenEntity();
      repo.save.mockResolvedValue(saved);

      const result = await sut.insert(input);

      expect(repo.create).toHaveBeenCalledWith({
        user: { id: input.userId },
        jti: input.jti,
        familyId: input.familyId,
        tokenHash: input.tokenHash,
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
        lastRotatedAt: input.issuedAt,
      });
      expect(repo.save).toHaveBeenCalled();
      expect(result.userId).toBe(1);
      expect(result.jti).toBe('jti-abc-123');
      expect(result.familyId).toBe('family-xyz-789');
      expect(result.tokenHash).toBe('sha256-hash-value');
      expect(result.rotatedAt).toBeNull();
      expect(result.revokedAt).toBeNull();
    });

    it('maps entity with user relation to row correctly', async () => {
      const input = makeInsertInput({ userId: 42 });
      const saved = makeRefreshTokenEntity({ user: makeUser({ id: 42 }) });
      repo.save.mockResolvedValue(saved);

      const result = await sut.insert(input);

      expect(result.userId).toBe(42);
      expect(result.id).toBe('uuid-token-1');
      expect(result.createdAt).toEqual(saved.createdAt);
    });

    it('falls back to userId field when user relation is not loaded', async () => {
      const input = makeInsertInput({ userId: 7 });
      const saved = makeRefreshTokenEntity({
        id: 'uuid-token-2',
        user: undefined,
        userId: 7,
        jti: 'jti-fallback',
        familyId: 'family-fallback',
        tokenHash: 'hash-fallback',
      });
      repo.save.mockResolvedValue(saved);

      const result = await sut.insert(input);

      expect(result.userId).toBe(7);
    });

    it('throws if userId cannot be resolved from entity', async () => {
      const input = makeInsertInput();
      const saved = makeRefreshTokenEntity({
        id: 'uuid-broken',
        user: undefined,
        jti: 'jti-x',
        familyId: 'fam-x',
        tokenHash: 'hash-x',
      });
      repo.save.mockResolvedValue(saved);

      await expect(sut.insert(input)).rejects.toThrow('Refresh token row is missing userId');
    });
  });

  // ─── findByJti ───
  describe('findByJti', () => {
    it('returns StoredRefreshTokenRow when found', async () => {
      const entity = makeRefreshTokenEntity();
      repo.findOne.mockResolvedValue(entity);

      const result = await sut.findByJti('jti-abc-123');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { jti: 'jti-abc-123' },
        relations: { user: true },
      });
      expect(result).not.toBeNull();
      expect(result!.jti).toBe('jti-abc-123');
      expect(result!.userId).toBe(1);
    });

    it('returns null when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await sut.findByJti('nonexistent-jti');

      expect(result).toBeNull();
    });
  });

  // ─── rotate ───
  describe('rotate', () => {
    it('inserts new token and updates current token in a transaction', async () => {
      const nextInput = makeInsertInput({ jti: 'jti-next', familyId: 'family-xyz-789' });
      const savedEntity = makeRefreshTokenEntity({ id: 'uuid-next', jti: 'jti-next' });
      txRepo.save.mockResolvedValue(savedEntity);

      const result = await sut.rotate({
        currentTokenId: 'uuid-token-1',
        next: nextInput,
      });

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(txRepo.create).toHaveBeenCalledWith({
        user: { id: nextInput.userId },
        jti: nextInput.jti,
        familyId: nextInput.familyId,
        tokenHash: nextInput.tokenHash,
        issuedAt: nextInput.issuedAt,
        expiresAt: nextInput.expiresAt,
        lastRotatedAt: nextInput.issuedAt,
      });
      expect(txRepo.save).toHaveBeenCalled();
      expect(txRepo.update).toHaveBeenCalledWith(
        'uuid-token-1',
        expect.objectContaining({
          rotatedAt: expect.any(Date),
          replacedByTokenId: 'uuid-next',
        }),
      );
      expect(result.jti).toBe('jti-next');
      expect(result.id).toBe('uuid-next');
    });

    it('returns the newly inserted token row', async () => {
      const nextInput = makeInsertInput({ userId: 5 });
      const savedEntity = makeRefreshTokenEntity({
        id: 'uuid-rotated',
        user: makeUser({ id: 5 }),
      });
      txRepo.save.mockResolvedValue(savedEntity);

      const result = await sut.rotate({ currentTokenId: 'old-id', next: nextInput });

      expect(result.userId).toBe(5);
      expect(result.id).toBe('uuid-rotated');
    });
  });

  // ─── revokeByJti ───
  describe('revokeByJti', () => {
    it('executes an update query builder chain to set revokedAt', async () => {
      await sut.revokeByJti('jti-to-revoke');

      expect(repo.createQueryBuilder).toHaveBeenCalled();
      expect(qb.update).toHaveBeenCalledWith(AuthRefreshToken);
      expect(qb.set).toHaveBeenCalledWith({
        revokedAt: expect.any(Function),
      });
      expect(qb.where).toHaveBeenCalledWith('jti = :jti', { jti: 'jti-to-revoke' });
      expect(qb.execute).toHaveBeenCalled();
    });
  });

  // ─── deleteExpiredTokens ───
  describe('deleteExpiredTokens', () => {
    it('deletes expired tokens with default limit and returns affected count', async () => {
      qb.execute.mockResolvedValue({ affected: 42 });

      const result = await sut.deleteExpiredTokens();

      expect(repo.createQueryBuilder).toHaveBeenCalled();
      expect(qb.delete).toHaveBeenCalled();
      expect(qb.from).toHaveBeenCalledWith(AuthRefreshToken);
      expect(qb.where).toHaveBeenCalledWith(expect.stringContaining('expiresAt'), { limit: 10000 });
      expect(result).toBe(42);
    });

    it('uses custom limit when provided', async () => {
      qb.execute.mockResolvedValue({ affected: 5 });

      const result = await sut.deleteExpiredTokens(100);

      expect(qb.where).toHaveBeenCalledWith(expect.stringContaining('LIMIT :limit'), {
        limit: 100,
      });
      expect(result).toBe(5);
    });

    it('returns 0 when affected is undefined', async () => {
      qb.execute.mockResolvedValue({ affected: undefined });

      const result = await sut.deleteExpiredTokens();

      expect(result).toBe(0);
    });
  });

  // ─── revokeAllForUser ───
  describe('revokeAllForUser', () => {
    it('revokes all tokens for a user without exclusion', async () => {
      await sut.revokeAllForUser(42);

      expect(repo.createQueryBuilder).toHaveBeenCalled();
      expect(qb.update).toHaveBeenCalledWith(AuthRefreshToken);
      expect(qb.set).toHaveBeenCalledWith({ revokedAt: expect.any(Date) });
      expect(qb.where).toHaveBeenCalledWith('"userId" = :userId AND "revokedAt" IS NULL', {
        userId: 42,
      });
      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(qb.execute).toHaveBeenCalled();
    });

    it('excludes a specific JTI when provided', async () => {
      await sut.revokeAllForUser(42, 'jti-keep');

      expect(qb.andWhere).toHaveBeenCalledWith('jti != :excludeJti', { excludeJti: 'jti-keep' });
      expect(qb.execute).toHaveBeenCalled();
    });
  });

  // ─── revokeFamily ───
  describe('revokeFamily', () => {
    it('revokes all tokens in the family without reuse detection', async () => {
      await sut.revokeFamily('family-abc');

      expect(repo.createQueryBuilder).toHaveBeenCalled();
      expect(qb.update).toHaveBeenCalledWith(AuthRefreshToken);
      expect(qb.set).toHaveBeenCalledWith({
        revokedAt: expect.any(Function),
      });
      expect(qb.where).toHaveBeenCalledWith('"familyId" = :familyId', { familyId: 'family-abc' });
      expect(qb.execute).toHaveBeenCalled();
    });

    it('sets reuseDetectedAt when reuseDetected is true', async () => {
      await sut.revokeFamily('family-abc', true);

      expect(qb.set).toHaveBeenCalledWith({
        revokedAt: expect.any(Function),
        reuseDetectedAt: expect.any(Function),
      });
      expect(qb.where).toHaveBeenCalledWith('"familyId" = :familyId', { familyId: 'family-abc' });
      expect(qb.execute).toHaveBeenCalled();
    });

    it('does not set reuseDetectedAt when reuseDetected is false (default)', async () => {
      await sut.revokeFamily('family-xyz', false);

      expect(qb.set).toHaveBeenCalledWith({
        revokedAt: expect.any(Function),
      });
      expect(qb.execute).toHaveBeenCalled();
    });
  });
});
