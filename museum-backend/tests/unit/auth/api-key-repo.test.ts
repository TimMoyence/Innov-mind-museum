import type { Repository, UpdateResult } from 'typeorm';

import { ApiKey } from '@modules/auth/domain/api-key/apiKey.entity';
import { ApiKeyRepositoryPg } from '@modules/auth/adapters/secondary/pg/apiKey.repository.pg';
import { makeUser } from 'tests/helpers/auth/user.fixtures';
import { makeMockTypeOrmRepo, makeMockDataSource } from 'tests/helpers/shared/mock-deps';

// ─── TypeORM repo + DataSource mock factory ───
function buildMocks() {
  const { repo } = makeMockTypeOrmRepo<ApiKey>();
  const dataSource = makeMockDataSource(repo);
  return { repo, dataSource };
}

/** Build a fake ApiKey entity. */
function makeApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  const user = makeUser();
  return {
    id: 1,
    prefix: 'msk_test',
    hash: 'hmac-sha256-hash',
    salt: 'random-salt-64chars',
    name: 'Test API Key',
    user,
    userId: user.id,
    museumId: null,
    expiresAt: new Date('2027-01-01T00:00:00Z'),
    lastUsedAt: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as ApiKey;
}

describe('ApiKeyRepositoryPg', () => {
  let sut: ApiKeyRepositoryPg;
  let repo: jest.Mocked<Repository<ApiKey>>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = buildMocks();
    repo = mocks.repo;
    sut = new ApiKeyRepositoryPg(mocks.dataSource);
  });

  // ─── findByPrefix ───
  describe('findByPrefix', () => {
    it('returns an active ApiKey when found by prefix', async () => {
      const key = makeApiKey();
      repo.findOne.mockResolvedValue(key);

      const result = await sut.findByPrefix('msk_test');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { prefix: 'msk_test', isActive: true },
      });
      expect(result).toBe(key);
    });

    it('returns null when no active key matches', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await sut.findByPrefix('msk_none');

      expect(result).toBeNull();
    });

    it('does not return inactive keys', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await sut.findByPrefix('msk_revoked');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { prefix: 'msk_revoked', isActive: true },
      });
      expect(result).toBeNull();
    });
  });

  // ─── findByUserId ───
  describe('findByUserId', () => {
    it('returns all API keys for a user ordered by createdAt DESC', async () => {
      const key1 = makeApiKey({ id: 1, createdAt: new Date('2026-01-01') });
      const key2 = makeApiKey({ id: 2, createdAt: new Date('2026-02-01') });
      repo.find.mockResolvedValue([key2, key1]);

      const result = await sut.findByUserId(1);

      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 1 },
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(1);
    });

    it('returns empty array when user has no API keys', async () => {
      repo.find.mockResolvedValue([]);

      const result = await sut.findByUserId(999);

      expect(result).toEqual([]);
    });
  });

  // ─── save ───
  describe('save', () => {
    it('creates entity from key fields and saves it', async () => {
      const key = makeApiKey();
      const saved = makeApiKey({ id: 10 });
      repo.save.mockResolvedValue(saved);

      const result = await sut.save(key);

      expect(repo.create).toHaveBeenCalledWith({
        prefix: key.prefix,
        hash: key.hash,
        salt: key.salt,
        name: key.name,
        userId: key.userId,
        expiresAt: key.expiresAt,
        isActive: true,
      });
      expect(repo.save).toHaveBeenCalled();
      expect(result).toBe(saved);
    });

    it('defaults isActive to true when key.isActive is undefined', async () => {
      const key = makeApiKey({ isActive: undefined as unknown as boolean });
      repo.save.mockResolvedValue(key);

      await sut.save(key);

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
    });

    it('preserves isActive=false when explicitly set', async () => {
      const key = makeApiKey({ isActive: false });
      repo.save.mockResolvedValue(key);

      await sut.save(key);

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });

    it('handles null expiresAt', async () => {
      const key = makeApiKey({ expiresAt: null });
      repo.save.mockResolvedValue(key);

      await sut.save(key);

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: null }));
    });
  });

  // ─── remove (soft-delete) ───
  describe('remove', () => {
    it('returns true when key exists, belongs to user, and is deactivated', async () => {
      repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

      const result = await sut.remove(5, 1);

      expect(repo.update).toHaveBeenCalledWith(
        { id: 5, userId: 1, isActive: true },
        { isActive: false },
      );
      expect(result).toBe(true);
    });

    it('returns false when key does not exist or does not belong to user', async () => {
      repo.update.mockResolvedValue({ affected: 0 } as UpdateResult);

      const result = await sut.remove(999, 1);

      expect(result).toBe(false);
    });

    it('returns false when affected is undefined', async () => {
      repo.update.mockResolvedValue({
        affected: undefined,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);

      const result = await sut.remove(5, 1);

      expect(result).toBe(false);
    });

    it('only targets active keys (isActive: true in where clause)', async () => {
      repo.update.mockResolvedValue({ affected: 0 } as UpdateResult);

      await sut.remove(5, 1);

      expect(repo.update).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }), {
        isActive: false,
      });
    });
  });

  // ─── updateLastUsed ───
  describe('updateLastUsed', () => {
    it('updates lastUsedAt timestamp for the given key ID', async () => {
      const before = Date.now();
      repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);

      await sut.updateLastUsed(7);

      expect(repo.update).toHaveBeenCalledWith(7, {
        lastUsedAt: expect.any(Date),
      });

      const calledDate = (repo.update.mock.calls[0][1] as { lastUsedAt: Date }).lastUsedAt;
      expect(calledDate.getTime()).toBeGreaterThanOrEqual(before);
      expect(calledDate.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});
