import type { Repository } from 'typeorm';

import { UserMemory } from '@modules/chat/domain/userMemory.entity';
import { TypeOrmUserMemoryRepository } from '@modules/chat/adapters/secondary/userMemory.repository.typeorm';
import { makeInMemoryUserMemoryRepository } from 'tests/helpers/chat/userMemory.fixtures';
import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';
import { makeMockTypeOrmRepo, makeMockDataSource } from 'tests/helpers/shared/mock-deps';

// ─── Mock helpers ─────────────────────────────────────────────────────

function buildMocks() {
  const qb = makeMockQb({ execute: jest.fn().mockResolvedValue({}) });
  const { repo } = makeMockTypeOrmRepo<UserMemory>({ qb });
  const dataSource = makeMockDataSource(repo);
  return { repo, qb, dataSource };
}

function makeUserMemory(overrides: Partial<UserMemory> = {}): UserMemory {
  return Object.assign(new UserMemory(), {
    id: 'mem-001',
    userId: 1,
    preferredExpertise: 'beginner',
    favoritePeriods: [],
    favoriteArtists: [],
    museumsVisited: [],
    totalArtworksDiscussed: 0,
    notableArtworks: [],
    interests: [],
    summary: null,
    sessionCount: 0,
    lastSessionId: null,
    version: 1,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('TypeOrmUserMemoryRepository', () => {
  let sut: TypeOrmUserMemoryRepository;
  let repo: jest.Mocked<Repository<UserMemory>>;
  let qb: ReturnType<typeof makeMockQb>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = buildMocks();
    repo = mocks.repo;
    qb = mocks.qb;
    sut = new TypeOrmUserMemoryRepository(mocks.dataSource);
  });

  // ─── getByUserId ───
  describe('getByUserId', () => {
    it('returns entity when found', async () => {
      const memory = makeUserMemory({ userId: 42 });
      repo.findOne.mockResolvedValue(memory);

      const result = await sut.getByUserId(42);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { userId: 42 } });
      expect(result).toBe(memory);
    });

    it('returns null when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await sut.getByUserId(999);

      expect(result).toBeNull();
    });
  });

  // ─── upsert ───
  describe('upsert', () => {
    it('inserts new record and returns it', async () => {
      const memory = makeUserMemory({ userId: 1, preferredExpertise: 'expert' });
      repo.findOne.mockResolvedValue(memory);

      const result = await sut.upsert(1, { preferredExpertise: 'expert' });

      expect(qb.insert).toHaveBeenCalled();
      expect(qb.into).toHaveBeenCalledWith(UserMemory);
      expect(qb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          preferredExpertise: 'expert',
        }),
      );
      expect(qb.orUpdate).toHaveBeenCalledWith(['preferred_expertise'], ['user_id']);
      expect(qb.execute).toHaveBeenCalled();
      expect(result).toBe(memory);
    });

    it('updates existing record with multiple fields', async () => {
      const memory = makeUserMemory({
        userId: 5,
        favoriteArtists: ['Monet'],
        sessionCount: 3,
      });
      repo.findOne.mockResolvedValue(memory);

      const result = await sut.upsert(5, {
        favoriteArtists: ['Monet'],
        sessionCount: 3,
        lastSessionId: 'session-xyz',
      });

      expect(qb.orUpdate).toHaveBeenCalledWith(
        ['favorite_artists', 'session_count', 'last_session_id'],
        ['user_id'],
      );
      expect(result).toBe(memory);
    });

    it('converts camelCase keys to snake_case for orUpdate columns', async () => {
      repo.findOne.mockResolvedValue(makeUserMemory());

      await sut.upsert(1, {
        totalArtworksDiscussed: 10,
        museumsVisited: ['Louvre'],
      });

      expect(qb.orUpdate).toHaveBeenCalledWith(
        ['total_artworks_discussed', 'museums_visited'],
        ['user_id'],
      );
    });
  });

  // ─── deleteByUserId ───
  describe('deleteByUserId', () => {
    it('deletes by userId', async () => {
      repo.delete.mockResolvedValue({ affected: 1, raw: [] });

      await sut.deleteByUserId(42);

      expect(repo.delete).toHaveBeenCalledWith({ userId: 42 });
    });

    it('does not throw when no rows deleted', async () => {
      repo.delete.mockResolvedValue({ affected: 0, raw: [] });

      await expect(sut.deleteByUserId(999)).resolves.toBeUndefined();
    });
  });
});

// ─── In-memory mock — Spec C T1.3 contract ─────────────────────────────

describe('makeInMemoryUserMemoryRepository — Spec C T1.3 contract', () => {
  it('upserts languagePreference + sessionDurationP90Minutes through UserMemoryUpdates', async () => {
    const repo = makeInMemoryUserMemoryRepository();
    await repo.upsert(42, { languagePreference: 'fr', sessionDurationP90Minutes: 25 });
    const m = await repo.getByUserId(42);
    expect(m?.languagePreference).toBe('fr');
    expect(m?.sessionDurationP90Minutes).toBe(25);
  });

  it('exposes getRecentSessionsForUser returning RecentSessionAggregate[]', async () => {
    const repo = makeInMemoryUserMemoryRepository();
    expect(typeof repo.getRecentSessionsForUser).toBe('function');
    await expect(repo.getRecentSessionsForUser(42, 10)).resolves.toEqual([]);
  });
});
