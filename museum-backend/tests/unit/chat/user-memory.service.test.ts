import { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import type { UserMemoryRepository } from '@modules/chat/domain/memory/userMemory.repository.interface';
import type { UserMemory } from '@modules/chat/domain/memory/userMemory.entity';
import type { VisitContext } from '@modules/chat/domain/chat.types';
import { makeMemory } from 'tests/helpers/chat/userMemory.fixtures';
import { makeCache } from '../../helpers/chat/cache.fixtures';

const makeRepo = (memory: UserMemory | null = null): jest.Mocked<UserMemoryRepository> => ({
  getByUserId: jest.fn().mockResolvedValue(memory),
  upsert: jest.fn().mockImplementation(async (_userId, updates) => ({
    ...makeMemory(),
    ...updates,
  })),
  deleteByUserId: jest.fn().mockResolvedValue(undefined),
  getRecentSessionsForUser: jest.fn().mockResolvedValue([]),
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

      expect(cache.set).toHaveBeenCalledWith('memory:prompt:42', expect.any(String), 3600);
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

      const upsertCall = repo.upsert.mock.calls[0][1];
      expect(upsertCall.museumsVisited).toContain('Louvre');
      expect(upsertCall.museumsVisited).toContain('Orsay');
    });

    it('does not duplicate existing museum (case-insensitive)', async () => {
      const existing = makeMemory({ museumsVisited: ['Orsay'] });
      const repo = makeRepo(existing);
      const svc = new UserMemoryService(repo);
      const ctx = makeVisitContext({ museumName: 'orsay' });

      await svc.updateAfterSession(42, ctx, 'sess-2');

      const upsertCall = repo.upsert.mock.calls[0][1];
      expect(upsertCall.museumsVisited).toBeUndefined(); // no update needed
    });

    it('merges artworks discussed', async () => {
      const existing = makeMemory({ notableArtworks: [], totalArtworksDiscussed: 0 });
      const repo = makeRepo(existing);
      const svc = new UserMemoryService(repo);
      const ctx = makeVisitContext();

      await svc.updateAfterSession(42, ctx, 'sess-2');

      const upsertCall = repo.upsert.mock.calls[0][1];
      expect(upsertCall.notableArtworks).toHaveLength(1);
      expect(upsertCall.notableArtworks![0].title).toBe('Water Lilies');
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

  // ── getUserMemory (GDPR export) ─────────────────────────────────────

  describe('getUserMemory', () => {
    it('returns memory entity for existing user', async () => {
      const memory = makeMemory({ userId: 42 });
      const repo = makeRepo(memory);
      const svc = new UserMemoryService(repo);

      const result = await svc.getUserMemory(42);

      expect(result).toEqual(memory);
      expect(repo.getByUserId).toHaveBeenCalledWith(42);
    });

    it('returns null for user with no memory', async () => {
      const repo = makeRepo(null);
      const svc = new UserMemoryService(repo);

      const result = await svc.getUserMemory(42);

      expect(result).toBeNull();
    });
  });

  // ── updateAfterSession (uncovered branches) ─────────────────────────

  describe('updateAfterSession — uncovered branches', () => {
    it('does not merge expertise when expertiseSignals < 3', async () => {
      const repo = makeRepo(null);
      const svc = new UserMemoryService(repo);
      const ctx = makeVisitContext({
        detectedExpertise: 'expert',
        expertiseSignals: 2,
      });

      await svc.updateAfterSession(42, ctx, 'sess-1');

      const upsertCall = repo.upsert.mock.calls[0][1];
      expect(upsertCall.preferredExpertise).toBeUndefined();
    });

    it('merges expertise when detectedExpertise is set and signals >= 3', async () => {
      const repo = makeRepo(null);
      const svc = new UserMemoryService(repo);
      const ctx = makeVisitContext({
        detectedExpertise: 'expert',
        expertiseSignals: 5,
      });

      await svc.updateAfterSession(42, ctx, 'sess-1');

      const upsertCall = repo.upsert.mock.calls[0][1];
      expect(upsertCall.preferredExpertise).toBe('expert');
    });

    it('does not merge museum when museumName is undefined', async () => {
      const repo = makeRepo(null);
      const svc = new UserMemoryService(repo);
      const ctx = makeVisitContext({ museumName: undefined });

      await svc.updateAfterSession(42, ctx, 'sess-1');

      const upsertCall = repo.upsert.mock.calls[0][1];
      expect(upsertCall.museumsVisited).toBeUndefined();
    });

    it('does not merge artists when no artworks have artist names', async () => {
      const repo = makeRepo(null);
      const svc = new UserMemoryService(repo);
      const ctx = makeVisitContext({
        artworksDiscussed: [
          {
            title: 'Unknown Painting',
            artist: undefined,
            messageId: 'msg-1',
            discussedAt: '2026-01-01T00:00:00Z',
          },
        ],
      });

      await svc.updateAfterSession(42, ctx, 'sess-1');

      const upsertCall = repo.upsert.mock.calls[0][1];
      expect(upsertCall.favoriteArtists).toBeUndefined();
    });

    it('deduplicates artists (case-insensitive)', async () => {
      const existing = makeMemory({ favoriteArtists: ['Monet'] });
      const repo = makeRepo(existing);
      const svc = new UserMemoryService(repo);
      const ctx = makeVisitContext({
        artworksDiscussed: [
          {
            title: 'Painting',
            artist: 'monet',
            messageId: 'msg-1',
            discussedAt: '2026-01-01T00:00:00Z',
          },
        ],
      });

      await svc.updateAfterSession(42, ctx, 'sess-1');

      const upsertCall = repo.upsert.mock.calls[0][1];
      expect(upsertCall.favoriteArtists).toBeUndefined(); // duplicate, no update
    });

    it('adds new artists that are not duplicates', async () => {
      const existing = makeMemory({ favoriteArtists: ['Monet'] });
      const repo = makeRepo(existing);
      const svc = new UserMemoryService(repo);
      const ctx = makeVisitContext({
        artworksDiscussed: [
          {
            title: 'Painting',
            artist: 'Renoir',
            messageId: 'msg-1',
            discussedAt: '2026-01-01T00:00:00Z',
          },
        ],
      });

      await svc.updateAfterSession(42, ctx, 'sess-1');

      const upsertCall = repo.upsert.mock.calls[0][1];
      expect(upsertCall.favoriteArtists).toEqual(['Monet', 'Renoir']);
    });

    it('does not merge artworks when artworksDiscussed is empty', async () => {
      const repo = makeRepo(null);
      const svc = new UserMemoryService(repo);
      const ctx = makeVisitContext({ artworksDiscussed: [] });

      await svc.updateAfterSession(42, ctx, 'sess-1');

      const upsertCall = repo.upsert.mock.calls[0][1];
      expect(upsertCall.notableArtworks).toBeUndefined();
      expect(upsertCall.totalArtworksDiscussed).toBeUndefined();
    });

    it('sets museum on notable artwork from visit context', async () => {
      const existing = makeMemory({ notableArtworks: [], totalArtworksDiscussed: 0 });
      const repo = makeRepo(existing);
      const svc = new UserMemoryService(repo);
      const ctx = makeVisitContext({ museumName: 'Orsay' });

      await svc.updateAfterSession(42, ctx, 'sess-1');

      const upsertCall = repo.upsert.mock.calls[0][1];
      expect(upsertCall.notableArtworks![0].museum).toBe('Orsay');
    });

    it('sets museum to undefined when museumName is null-like', async () => {
      const existing = makeMemory({ notableArtworks: [], totalArtworksDiscussed: 0 });
      const repo = makeRepo(existing);
      const svc = new UserMemoryService(repo);
      const ctx = makeVisitContext({ museumName: undefined });
      // Override artworksDiscussed to have at least one entry
      ctx.artworksDiscussed = [
        {
          title: 'Art',
          artist: 'Artist',
          messageId: 'msg-1',
          discussedAt: '2026-01-01T00:00:00Z',
        },
      ];

      await svc.updateAfterSession(42, ctx, 'sess-1');

      const upsertCall = repo.upsert.mock.calls[0][1];
      expect(upsertCall.notableArtworks![0].museum).toBeUndefined();
    });
  });

  // ── invalidateCache ─────────────────────────────────────────────────

  describe('invalidateCache', () => {
    it('does nothing when no cache is configured', async () => {
      const repo = makeRepo();
      const svc = new UserMemoryService(repo);

      await expect(svc.invalidateCache(42)).resolves.toBeUndefined();
    });

    it('deletes cache key when cache is configured', async () => {
      const repo = makeRepo();
      const cache = makeCache();
      const svc = new UserMemoryService(repo, cache);

      await svc.invalidateCache(42);

      expect(cache.del).toHaveBeenCalledWith('memory:prompt:42');
    });
  });

  // ── getMemoryForPrompt (uncovered branch: cache miss, no cache) ─────

  describe('getMemoryForPrompt — uncovered branches', () => {
    it('fetches from repo and does not store when no cache configured', async () => {
      const repo = makeRepo(makeMemory({ sessionCount: 1 }));
      const svc = new UserMemoryService(repo);

      const result = await svc.getMemoryForPrompt(42);

      expect(repo.getByUserId).toHaveBeenCalledWith(42);
      expect(result).toContain('[USER MEMORY]');
    });

    it('fetches from repo when cache returns null', async () => {
      const repo = makeRepo(makeMemory({ sessionCount: 1 }));
      const cache = makeCache();
      cache.get.mockResolvedValue(null);
      const svc = new UserMemoryService(repo, cache);

      const result = await svc.getMemoryForPrompt(42);

      expect(repo.getByUserId).toHaveBeenCalledWith(42);
      expect(cache.set).toHaveBeenCalled();
      expect(result).toContain('[USER MEMORY]');
    });
  });
});
