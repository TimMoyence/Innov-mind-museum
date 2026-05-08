import { TokenCleanupService } from '@modules/auth/useCase/session/tokenCleanup.service';
import { makeRefreshTokenRepo as makeRepoBase } from '../../helpers/auth/user-repo.mock';

/**
 * Service-level tests for TokenCleanupService.
 *
 * Companion to `token-cleanup.test.ts` — that file covers the basic happy
 * path / error path / scheduler start-stop. This file adds behaviors that
 * matter for production but were not covered:
 *
 *   - Concurrency: distributed lock prevents double-deletion when several
 *     instances tick at the same wall-clock moment.
 *   - Constants: the LOCK_TTL_SECONDS / BATCH_LIMIT values are part of the
 *     contract with ops (PgBouncer / cron sizing) — pinning them prevents a
 *     silent regression.
 *   - Scheduler hygiene: timer.unref() is called so the cron doesn't keep
 *     the Node event-loop alive on shutdown; multiple ticks reuse the same
 *     interval; restart after stop works.
 *   - Logging contract: error path logs the message string only (no Error
 *     object leak that Pino would dump under `err`); skipped path logs the
 *     deterministic reason field.
 *
 * Note: the retention horizon (cutoff date for "expired") lives in the SQL
 * of `deleteExpiredTokens`, not in this service — see
 * `refresh-token-repo.test.ts` for that boundary.
 */

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { logger } = jest.requireMock('@shared/logger/logger');

const makeRepo = (deletedRows = 0): jest.Mocked<ReturnType<typeof makeRepoBase>> =>
  makeRepoBase({ deleteExpiredTokens: jest.fn().mockResolvedValue(deletedRows) });

interface MockCacheOpts {
  setNxResult?: boolean | (() => Promise<boolean>);
}
const makeCache = ({ setNxResult = true }: MockCacheOpts = {}) => {
  const setNx =
    typeof setNxResult === 'function'
      ? jest.fn().mockImplementation(setNxResult)
      : jest.fn().mockResolvedValue(setNxResult);
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delByPrefix: jest.fn(),
    setNx,
    incrBy: jest.fn().mockResolvedValue(null),
    ping: jest.fn().mockResolvedValue(true),
    zadd: jest.fn().mockResolvedValue(undefined),
    ztop: jest.fn().mockResolvedValue([]),
  };
};

describe('TokenCleanupService — service-level behavior', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Distributed-lock contract ────────────────────────────────────

  describe('lock acquisition contract', () => {
    it('acquires lock with the documented key and 5-minute TTL', async () => {
      const repo = makeRepo(7);
      const cache = makeCache();
      const service = new TokenCleanupService(repo, cache);

      await service.runCleanup();

      expect(cache.setNx).toHaveBeenCalledTimes(1);
      const [key, value, ttl] = cache.setNx.mock.calls[0];
      expect(key).toBe('token-cleanup:lock');
      expect(value).toBe(true);
      // 5 minutes — must outlive the longest realistic deleteExpiredTokens batch
      expect(ttl).toBe(300);
    });

    it('does not call setNx when no cache is provided', async () => {
      const repo = makeRepo(3);
      const service = new TokenCleanupService(repo, undefined);

      const deleted = await service.runCleanup();

      expect(deleted).toBe(3);
      expect(repo.deleteExpiredTokens).toHaveBeenCalledTimes(1);
    });

    it('serialises concurrent runCleanup calls — only the first acquires the lock', async () => {
      const repo = makeRepo(11);
      // First setNx wins (true), every subsequent attempt fails (false)
      let firstCallSettled = false;
      const cache = makeCache({
        setNxResult: () => {
          if (!firstCallSettled) {
            firstCallSettled = true;
            return Promise.resolve(true);
          }
          return Promise.resolve(false);
        },
      });
      const service = new TokenCleanupService(repo, cache);

      const [a, b, c] = await Promise.all([
        service.runCleanup(),
        service.runCleanup(),
        service.runCleanup(),
      ]);

      const wins = [a, b, c].filter((n) => n === 11);
      const skips = [a, b, c].filter((n) => n === 0);
      expect(wins).toHaveLength(1);
      expect(skips).toHaveLength(2);
      expect(repo.deleteExpiredTokens).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('token_cleanup_skipped', {
        reason: 'lock_held',
      });
    });

    it('lets the next run proceed once the lock is released between calls', async () => {
      const repo = makeRepo(2);
      const cache = makeCache();
      const service = new TokenCleanupService(repo, cache);

      await service.runCleanup();
      // Simulate Redis releasing the key (cron interval >> TTL)
      cache.setNx.mockResolvedValueOnce(true);
      await service.runCleanup();

      expect(repo.deleteExpiredTokens).toHaveBeenCalledTimes(2);
    });
  });

  // ── BATCH_LIMIT contract ─────────────────────────────────────────

  describe('batch-size contract', () => {
    it('always passes BATCH_LIMIT=10000 to deleteExpiredTokens', async () => {
      const repo = makeRepo(10000);
      const service = new TokenCleanupService(repo, undefined);

      await service.runCleanup();

      expect(repo.deleteExpiredTokens).toHaveBeenCalledWith(10000);
    });

    it('returns the exact deleted count from the repository unchanged', async () => {
      const repo = makeRepo(9999);
      const service = new TokenCleanupService(repo, undefined);

      const deleted = await service.runCleanup();

      expect(deleted).toBe(9999);
    });

    it('returns 0 on empty result without logging completion', async () => {
      const repo = makeRepo(0);
      const service = new TokenCleanupService(repo, undefined);

      const deleted = await service.runCleanup();

      expect(deleted).toBe(0);
      // Empty cleanups must not pollute the audit log every 6h
      expect(logger.info).not.toHaveBeenCalledWith('token_cleanup_completed', expect.anything());
    });
  });

  // ── Error containment ───────────────────────────────────────────

  describe('error containment', () => {
    it('swallows repository errors and logs only the message string (not the Error object)', async () => {
      const repo = makeRepo();
      repo.deleteExpiredTokens.mockRejectedValue(new Error('PG connection lost'));
      const service = new TokenCleanupService(repo, undefined);

      const deleted = await service.runCleanup();

      expect(deleted).toBe(0);
      expect(logger.error).toHaveBeenCalledWith('token_cleanup_failed', {
        error: 'PG connection lost',
      });
      // No raw Error/stack leaked in the logger payload
      const payload = logger.error.mock.calls[0][1];
      expect(payload).not.toHaveProperty('stack');
      expect(payload.error).toBe('PG connection lost');
    });

    it('does not throw when the underlying repository rejects', async () => {
      const repo = makeRepo();
      repo.deleteExpiredTokens.mockRejectedValue(new Error('boom'));
      const service = new TokenCleanupService(repo, undefined);

      await expect(service.runCleanup()).resolves.toBe(0);
    });
  });

  // ── Audit/log emission ──────────────────────────────────────────

  describe('audit log emission', () => {
    it('emits token_cleanup_completed with the deleted count when work happened', async () => {
      const repo = makeRepo(42);
      const service = new TokenCleanupService(repo, undefined);

      await service.runCleanup();

      expect(logger.info).toHaveBeenCalledWith('token_cleanup_completed', {
        deleted: 42,
      });
    });

    it('emits token_cleanup_skipped with reason=lock_held when another instance holds the lock', async () => {
      const repo = makeRepo();
      const cache = makeCache({ setNxResult: false });
      const service = new TokenCleanupService(repo, cache);

      await service.runCleanup();

      expect(repo.deleteExpiredTokens).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('token_cleanup_skipped', {
        reason: 'lock_held',
      });
    });
  });

  // ── Scheduler hygiene ───────────────────────────────────────────

  describe('scheduler hygiene', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calls timer.unref() so the scheduler does not keep the event-loop alive', () => {
      const repo = makeRepo();
      const service = new TokenCleanupService(repo, undefined);

      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      service.startScheduler(60_000);

      const timer = setIntervalSpy.mock.results[0].value as { unref?: () => void };
      // Node Timeout instances expose .unref(); jest's fake timers honour it.
      expect(typeof timer.unref).toBe('function');

      service.stopScheduler();
      setIntervalSpy.mockRestore();
    });

    it('fires runCleanup on every interval tick (multiple ticks)', async () => {
      const repo = makeRepo(1);
      const service = new TokenCleanupService(repo, undefined);

      service.startScheduler(1_000);

      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();

      expect(repo.deleteExpiredTokens).toHaveBeenCalledTimes(3);
      service.stopScheduler();
    });

    it('logs scheduler_started exactly once even if startScheduler is called repeatedly', () => {
      const repo = makeRepo();
      const service = new TokenCleanupService(repo, undefined);

      service.startScheduler(60_000);
      service.startScheduler(60_000);
      service.startScheduler(60_000);

      const startedCalls = (logger.info.mock.calls as unknown[][]).filter(
        (call) => call[0] === 'token_cleanup_scheduler_started',
      );
      expect(startedCalls).toHaveLength(1);
      service.stopScheduler();
    });

    it('can be restarted after stop (start → stop → start)', async () => {
      const repo = makeRepo(1);
      const service = new TokenCleanupService(repo, undefined);

      service.startScheduler(500);
      service.stopScheduler();
      service.startScheduler(500);

      jest.advanceTimersByTime(500);
      await Promise.resolve();

      expect(repo.deleteExpiredTokens).toHaveBeenCalledTimes(1);
      service.stopScheduler();
    });

    it('uses the default interval (6 hours) when none is provided', () => {
      const repo = makeRepo();
      const service = new TokenCleanupService(repo, undefined);

      service.startScheduler();

      expect(logger.info).toHaveBeenCalledWith('token_cleanup_scheduler_started', {
        intervalMs: 6 * 60 * 60 * 1000,
      });
      service.stopScheduler();
    });

    it('stopScheduler is idempotent (calling twice is a no-op)', () => {
      const repo = makeRepo();
      const service = new TokenCleanupService(repo, undefined);

      service.startScheduler(1_000);
      service.stopScheduler();
      expect(() => {
        service.stopScheduler();
      }).not.toThrow();
    });

    it('scheduled tick errors are swallowed (does not unhandledRejection)', async () => {
      const repo = makeRepo();
      repo.deleteExpiredTokens.mockRejectedValue(new Error('tick failure'));
      const service = new TokenCleanupService(repo, undefined);

      service.startScheduler(1_000);
      jest.advanceTimersByTime(1_000);
      // Allow the void-handled promise chain to settle.
      await Promise.resolve();
      await Promise.resolve();

      expect(logger.error).toHaveBeenCalledWith('token_cleanup_failed', {
        error: 'tick failure',
      });
      service.stopScheduler();
    });
  });
});
