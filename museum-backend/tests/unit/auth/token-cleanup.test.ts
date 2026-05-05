import { TokenCleanupService } from '@modules/auth/useCase/session/tokenCleanup.service';
import { makeRefreshTokenRepo as makeFullRefreshTokenRepo } from '../../helpers/auth/user-repo.mock';

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { logger } = jest.requireMock('@shared/logger/logger');

const makeRefreshTokenRepo = (deleteResult = 5) =>
  makeFullRefreshTokenRepo({ deleteExpiredTokens: jest.fn().mockResolvedValue(deleteResult) });

const makeCacheService = (setNxResult = true) => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  delByPrefix: jest.fn(),
  setNx: jest.fn().mockResolvedValue(setNxResult),
  incrBy: jest.fn().mockResolvedValue(null),
  ping: jest.fn().mockResolvedValue(true),
  zadd: jest.fn().mockResolvedValue(undefined),
  ztop: jest.fn().mockResolvedValue([]),
});

describe('TokenCleanupService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── runCleanup ──────────────────────────────────────────────────

  it('runs cleanup when lock is acquired (setNx returns true)', async () => {
    const repo = makeRefreshTokenRepo(42);
    const cache = makeCacheService(true);
    const service = new TokenCleanupService(repo, cache);

    const deleted = await service.runCleanup();

    expect(cache.setNx).toHaveBeenCalledWith('token-cleanup:lock', true, 300);
    expect(repo.deleteExpiredTokens).toHaveBeenCalledWith(10000);
    expect(deleted).toBe(42);
  });

  it('skips cleanup when lock is held (setNx returns false)', async () => {
    const repo = makeRefreshTokenRepo();
    const cache = makeCacheService(false);
    const service = new TokenCleanupService(repo, cache);

    const deleted = await service.runCleanup();

    expect(cache.setNx).toHaveBeenCalled();
    expect(repo.deleteExpiredTokens).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
    expect(logger.info).toHaveBeenCalledWith('token_cleanup_skipped', { reason: 'lock_held' });
  });

  it('runs cleanup without cache (no lock)', async () => {
    const repo = makeRefreshTokenRepo(10);
    const service = new TokenCleanupService(repo, undefined);

    const deleted = await service.runCleanup();

    expect(repo.deleteExpiredTokens).toHaveBeenCalledWith(10000);
    expect(deleted).toBe(10);
  });

  it('returns 0 and logs error if deleteExpiredTokens throws', async () => {
    const repo = makeRefreshTokenRepo();
    repo.deleteExpiredTokens.mockRejectedValue(new Error('DB down'));
    const service = new TokenCleanupService(repo, undefined);

    const deleted = await service.runCleanup();

    expect(deleted).toBe(0);
    expect(logger.error).toHaveBeenCalledWith('token_cleanup_failed', { error: 'DB down' });
  });

  it('logs completed with count when tokens were deleted', async () => {
    const repo = makeRefreshTokenRepo(15);
    const service = new TokenCleanupService(repo, undefined);

    await service.runCleanup();

    expect(logger.info).toHaveBeenCalledWith('token_cleanup_completed', { deleted: 15 });
  });

  it('does not log completed when no tokens were deleted', async () => {
    const repo = makeRefreshTokenRepo(0);
    const service = new TokenCleanupService(repo, undefined);

    await service.runCleanup();

    expect(logger.info).not.toHaveBeenCalledWith('token_cleanup_completed', expect.anything());
  });

  // ── Scheduler ───────────────────────────────────────────────────

  describe('startScheduler / stopScheduler', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('startScheduler fires runCleanup at the specified interval', async () => {
      const repo = makeRefreshTokenRepo(3);
      const service = new TokenCleanupService(repo, undefined);

      service.startScheduler(1000);
      expect(logger.info).toHaveBeenCalledWith('token_cleanup_scheduler_started', {
        intervalMs: 1000,
      });

      // Advance past one interval
      jest.advanceTimersByTime(1000);
      // Allow the async runCleanup to settle
      await Promise.resolve();

      expect(repo.deleteExpiredTokens).toHaveBeenCalledTimes(1);

      service.stopScheduler();
    });

    it('stopScheduler halts the interval', async () => {
      const repo = makeRefreshTokenRepo(1);
      const service = new TokenCleanupService(repo, undefined);

      service.startScheduler(500);
      service.stopScheduler();

      jest.advanceTimersByTime(2000);
      await Promise.resolve();

      expect(repo.deleteExpiredTokens).not.toHaveBeenCalled();
    });

    it('startScheduler called twice is a no-op on second call', () => {
      const repo = makeRefreshTokenRepo();
      const service = new TokenCleanupService(repo, undefined);

      service.startScheduler(1000);
      service.startScheduler(1000);

      // Logger should only be called once for scheduler_started
      const schedulerStartCalls = logger.info.mock.calls.filter(
        (call: unknown[]) => call[0] === 'token_cleanup_scheduler_started',
      );
      expect(schedulerStartCalls).toHaveLength(1);

      service.stopScheduler();
    });

    it('stopScheduler is safe to call when no scheduler is running', () => {
      const repo = makeRefreshTokenRepo();
      const service = new TokenCleanupService(repo, undefined);

      // Should not throw
      expect(() => {
        service.stopScheduler();
      }).not.toThrow();
    });
  });
});
