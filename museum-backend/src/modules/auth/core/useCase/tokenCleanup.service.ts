import type { CacheService } from '@shared/cache/cache.port';
import type { RefreshTokenRepositoryPg } from '../../adapters/secondary/refresh-token.repository.pg';
import { logger } from '@shared/logger/logger';

const LOCK_KEY = 'token-cleanup:lock';
const LOCK_TTL_SECONDS = 300;
const BATCH_LIMIT = 10000;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Periodically deletes expired refresh tokens with distributed-lock protection. */
export class TokenCleanupService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepositoryPg,
    private readonly cacheService?: CacheService,
  ) {}

  /** Run a single cleanup pass. Acquires a distributed lock if cache is available. */
  async runCleanup(): Promise<number> {
    if (this.cacheService) {
      const acquired = await this.cacheService.setNx(LOCK_KEY, true, LOCK_TTL_SECONDS);
      if (!acquired) {
        logger.info('token_cleanup_skipped', { reason: 'lock_held' });
        return 0;
      }
    }

    try {
      const deleted = await this.refreshTokenRepository.deleteExpiredTokens(BATCH_LIMIT);
      if (deleted > 0) {
        logger.info('token_cleanup_completed', { deleted });
      }
      return deleted;
    } catch (error) {
      logger.error('token_cleanup_failed', { error: (error as Error).message });
      return 0;
    }
  }

  /** Start the periodic cleanup scheduler. */
  startScheduler(intervalMs = DEFAULT_INTERVAL_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runCleanup();
    }, intervalMs);
    this.timer.unref();
    logger.info('token_cleanup_scheduler_started', { intervalMs });
  }

  /** Stop the scheduler. */
  stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
