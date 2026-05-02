import { UserMemoryService } from '@modules/chat/useCase/user-memory.service';
import type { UserMemoryRepository } from '@modules/chat/domain/userMemory.repository.interface';
import { makeMemory } from 'tests/helpers/chat/userMemory.fixtures';
import { makeCache } from '../../helpers/chat/cache.fixtures';

const makeRepo = (
  memory: ReturnType<typeof makeMemory> | null = null,
): jest.Mocked<UserMemoryRepository> => ({
  getByUserId: jest.fn().mockResolvedValue(memory),
  upsert: jest.fn().mockImplementation(async (_userId, updates) => ({
    ...makeMemory(),
    ...updates,
  })),
  deleteByUserId: jest.fn().mockResolvedValue(undefined),
  getRecentSessionsForUser: jest.fn().mockResolvedValue([]),
});

describe('UserMemoryService — memory toggle', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── getMemoryForPrompt with disabledByUser ────────────────────────

  describe('getMemoryForPrompt respects disabledByUser', () => {
    it('returns empty string when disabledByUser is true', async () => {
      const repo = makeRepo(makeMemory({ sessionCount: 5, disabledByUser: true }));
      const svc = new UserMemoryService(repo);

      const result = await svc.getMemoryForPrompt(42);

      expect(result).toBe('');
      expect(repo.getByUserId).toHaveBeenCalledWith(42);
    });

    it('returns prompt block when disabledByUser is false', async () => {
      const repo = makeRepo(makeMemory({ sessionCount: 5, disabledByUser: false }));
      const svc = new UserMemoryService(repo);

      const result = await svc.getMemoryForPrompt(42);

      expect(result).toContain('[USER MEMORY]');
    });

    it('skips cache and returns empty when disabledByUser is true', async () => {
      const repo = makeRepo(makeMemory({ sessionCount: 5, disabledByUser: true }));
      const cache = makeCache();
      // Even if cache has a value, we should still check the DB flag
      cache.get.mockResolvedValue(null);
      const svc = new UserMemoryService(repo, cache);

      const result = await svc.getMemoryForPrompt(42);

      expect(result).toBe('');
    });
  });

  // ── setDisabledByUser ─────────────────────────────────────────────

  describe('setDisabledByUser', () => {
    it('upserts disabledByUser=true and invalidates cache', async () => {
      const repo = makeRepo();
      const cache = makeCache();
      const svc = new UserMemoryService(repo, cache);

      await svc.setDisabledByUser(42, true);

      expect(repo.upsert).toHaveBeenCalledWith(42, { disabledByUser: true });
      expect(cache.del).toHaveBeenCalledWith('memory:prompt:42');
    });

    it('upserts disabledByUser=false to re-enable', async () => {
      const repo = makeRepo();
      const svc = new UserMemoryService(repo);

      await svc.setDisabledByUser(42, false);

      expect(repo.upsert).toHaveBeenCalledWith(42, { disabledByUser: false });
    });
  });

  // ── isDisabledByUser ──────────────────────────────────────────────

  describe('isDisabledByUser', () => {
    it('returns true when disabledByUser flag is set', async () => {
      const repo = makeRepo(makeMemory({ disabledByUser: true }));
      const svc = new UserMemoryService(repo);

      const result = await svc.isDisabledByUser(42);

      expect(result).toBe(true);
    });

    it('returns false when disabledByUser flag is not set', async () => {
      const repo = makeRepo(makeMemory({ disabledByUser: false }));
      const svc = new UserMemoryService(repo);

      const result = await svc.isDisabledByUser(42);

      expect(result).toBe(false);
    });

    it('returns false when no memory exists for user', async () => {
      const repo = makeRepo(null);
      const svc = new UserMemoryService(repo);

      const result = await svc.isDisabledByUser(42);

      expect(result).toBe(false);
    });
  });
});
