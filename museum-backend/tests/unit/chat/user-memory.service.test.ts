import { UserMemoryService } from '@modules/chat/application/user-memory.service';
import type { UserMemoryRepository } from '@modules/chat/domain/userMemory.repository.interface';
import type { UserMemory } from '@modules/chat/domain/userMemory.entity';
import type { VisitContext } from '@modules/chat/domain/chat.types';
import type { CacheService } from '@shared/cache/cache.port';

// ── Factories ──────────────────────────────────────────────────────────

const makeMemory = (overrides: Partial<UserMemory> = {}): UserMemory =>
  ({
    id: 'mem-uuid',
    userId: 42,
    preferredExpertise: 'beginner',
    favoritePeriods: [],
    favoriteArtists: ['Monet'],
    museumsVisited: ['Louvre'],
    totalArtworksDiscussed: 3,
    notableArtworks: [],
    interests: [],
    summary: null,
    sessionCount: 2,
    lastSessionId: 'sess-prev',
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }) as UserMemory;

const makeRepo = (memory: UserMemory | null = null): jest.Mocked<UserMemoryRepository> => ({
  getByUserId: jest.fn().mockResolvedValue(memory),
  upsert: jest.fn().mockImplementation(async (_userId, updates) => ({
    ...makeMemory(),
    ...updates,
  })),
  deleteByUserId: jest.fn().mockResolvedValue(undefined),
});

const makeCache = (): jest.Mocked<CacheService> => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delByPrefix: jest.fn().mockResolvedValue(undefined),
  setNx: jest.fn().mockResolvedValue(true),
});

const makeVisitContext = (overrides: Partial<VisitContext> = {}): VisitContext => ({
  museumName: 'Orsay',
  museumConfidence: 0.9,
  artworksDiscussed: [
    {
      title: 'Water Lilies',
      artist: 'Monet',
      messageId: 'msg-1',
      discussedAt: '2026-01-15T10:00:00Z',
    },
  ],
  roomsVisited: ['Impressionism Hall'],
  detectedExpertise: 'intermediate',
  expertiseSignals: 4,
  lastUpdated: '2026-01-15T10:30:00Z',
  ...overrides,
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('UserMemoryService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── getMemoryForPrompt ─────────────────────────────────────────────

  describe('getMemoryForPrompt', () => {
    it('returns empty string when user has no memory', async () => {
      const repo = makeRepo(null);
      const svc = new UserMemoryService(repo);

      const result = await svc.getMemoryForPrompt(42);

      expect(result).toBe('');
    });

    it('returns empty string when sessionCount is 0', async () => {
      const repo = makeRepo(makeMemory({ sessionCount: 0 }));
      const svc = new UserMemoryService(repo);

      const result = await svc.getMemoryForPrompt(42);

      expect(result).toBe('');
    });

    it('returns prompt block for existing memory', async () => {
      const repo = makeRepo(makeMemory({ sessionCount: 5, favoriteArtists: ['Monet', 'Renoir'] }));
      const svc = new UserMemoryService(repo);

      const result = await svc.getMemoryForPrompt(42);

      expect(result).toContain('[USER MEMORY]');
      expect(result).toContain('5 sessions');
      expect(result).toContain('Monet');
    });

    it('returns cached value on cache hit', async () => {
      const repo = makeRepo();
      const cache = makeCache();
      cache.get.mockResolvedValue('[USER MEMORY]\nCached block');
      const svc = new UserMemoryService(repo, cache);

      const result = await svc.getMemoryForPrompt(42);

      expect(result).toBe('[USER MEMORY]\nCached block');
      expect(repo.getByUserId).not.toHaveBeenCalled();
    });

    it('stores result in cache after repo fetch', async () => {
      const repo = makeRepo(makeMemory({ sessionCount: 1 }));
      const cache = makeCache();
      const svc = new UserMemoryService(repo, cache);

      await svc.getMemoryForPrompt(42);

      expect(cache.set).toHaveBeenCalledWith(
        'memory:prompt:42',
        expect.any(String),
        3600,
      );
    });
  });

  // ── updateAfterSession ─────────────────────────────────────────────

  describe('updateAfterSession', () => {
    it('increments sessionCount on first session', async () => {
      const repo = makeRepo(null);
      const svc = new UserMemoryService(repo);

      await svc.updateAfterSession(42, null, 'sess-1');

      expect(repo.upsert).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ sessionCount: 1, lastSessionId: 'sess-1' }),
      );
    });

    it('merges museums visited (dedup, capped)', async () => {
      const existing = makeMemory({ museumsVisited: ['Louvre'] });
      const repo = makeRepo(existing);
      const svc = new UserMemoryService(repo);
      const ctx = makeVisitContext({ museumName: 'Orsay' });

      await svc.updateAfterSession(42, ctx, 'sess-2');

      const upsertCall = repo.upsert.mock.calls[0]![1];
      expect(upsertCall.museumsVisited).toContain('Louvre');
      expect(upsertCall.museumsVisited).toContain('Orsay');
    });

    it('does not duplicate existing museum (case-insensitive)', async () => {
      const existing = makeMemory({ museumsVisited: ['Orsay'] });
      const repo = makeRepo(existing);
      const svc = new UserMemoryService(repo);
      const ctx = makeVisitContext({ museumName: 'orsay' });

      await svc.updateAfterSession(42, ctx, 'sess-2');

      const upsertCall = repo.upsert.mock.calls[0]![1];
      expect(upsertCall.museumsVisited).toBeUndefined(); // no update needed
    });

    it('merges artworks discussed', async () => {
      const existing = makeMemory({ notableArtworks: [], totalArtworksDiscussed: 0 });
      const repo = makeRepo(existing);
      const svc = new UserMemoryService(repo);
      const ctx = makeVisitContext();

      await svc.updateAfterSession(42, ctx, 'sess-2');

      const upsertCall = repo.upsert.mock.calls[0]![1];
      expect(upsertCall.notableArtworks).toHaveLength(1);
      expect(upsertCall.notableArtworks![0]!.title).toBe('Water Lilies');
      expect(upsertCall.totalArtworksDiscussed).toBe(1);
    });

    it('invalidates cache after update', async () => {
      const repo = makeRepo(null);
      const cache = makeCache();
      const svc = new UserMemoryService(repo, cache);

      await svc.updateAfterSession(42, null, 'sess-1');

      expect(cache.del).toHaveBeenCalledWith('memory:prompt:42');
    });

    it('swallows repository errors (fire-and-forget)', async () => {
      const repo = makeRepo(null);
      repo.upsert.mockRejectedValue(new Error('DB gone'));
      const svc = new UserMemoryService(repo);

      // Should NOT throw
      await expect(svc.updateAfterSession(42, null, 'sess-1')).resolves.toBeUndefined();
    });
  });

  // ── deleteUserMemory ───────────────────────────────────────────────

  describe('deleteUserMemory', () => {
    it('deletes memory and invalidates cache (GDPR)', async () => {
      const repo = makeRepo(makeMemory());
      const cache = makeCache();
      const svc = new UserMemoryService(repo, cache);

      await svc.deleteUserMemory(42);

      expect(repo.deleteByUserId).toHaveBeenCalledWith(42);
      expect(cache.del).toHaveBeenCalledWith('memory:prompt:42');
    });

    it('works without cache configured', async () => {
      const repo = makeRepo();
      const svc = new UserMemoryService(repo);

      await expect(svc.deleteUserMemory(42)).resolves.toBeUndefined();
      expect(repo.deleteByUserId).toHaveBeenCalledWith(42);
    });
  });
});
