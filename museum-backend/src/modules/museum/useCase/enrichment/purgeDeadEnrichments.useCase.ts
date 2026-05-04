import { logger } from '@shared/logger/logger';

import type { MuseumEnrichmentCachePort } from '../../domain/ports/museum-enrichment-cache.port';

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

/** Aggregate counters returned by a purge pass — useful for tests + logs. */
export interface PurgeDeadEnrichmentsResult {
  deleted: number;
}

/**
 * Deletes every enrichment cache row whose `fetchedAt` predates
 * `now − thresholdDays`. Acts as the hard-delete ceiling of the hybrid TTL
 * policy: the refresh scan (`RefreshStaleEnrichmentsUseCase`) re-fetches rows
 * still in the active museum set; anything still untouched after the purge
 * window is considered dead and reclaimed to keep the table bounded.
 *
 * Invoked daily AFTER the refresh scan so newly-refreshed rows are never
 * caught by the same pass. Fail-open: persistence errors are logged and
 * swallowed, mirroring `RefreshStaleEnrichmentsUseCase`.
 */
export class PurgeDeadEnrichmentsUseCase {
  constructor(private readonly cache: MuseumEnrichmentCachePort) {}

  /**
   * Runs a single purge pass.
   *
   * @param now Clock override for deterministic tests. Defaults to `new Date()`.
   * @param thresholdDays Hard-delete window in days. Rows older than
   *   `now − thresholdDays` are removed.
   */
  async execute(
    now: Date = new Date(),
    thresholdDays: number,
  ): Promise<PurgeDeadEnrichmentsResult> {
    const threshold = new Date(now.getTime() - thresholdDays * MS_PER_DAY);

    try {
      const deleted = await this.cache.deleteStaleSince(threshold);
      logger.info('purge_dead_enrichments_run', {
        threshold: threshold.toISOString(),
        thresholdDays,
        deleted,
      });
      return { deleted };
    } catch (err) {
      logger.warn('purge_dead_enrichments_failed', {
        threshold: threshold.toISOString(),
        thresholdDays,
        error: err instanceof Error ? err.message : String(err),
      });
      return { deleted: 0 };
    }
  }
}
