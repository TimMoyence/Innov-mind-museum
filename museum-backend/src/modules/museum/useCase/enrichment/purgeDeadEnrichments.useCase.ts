import { logger } from '@shared/logger/logger';

import type {
  PurgeDeadEnrichmentsPort,
  PurgeDeadEnrichmentsResult,
} from '@modules/museum/domain/ports/enrichment-usecases.port';
import type { MuseumEnrichmentCachePort } from '@modules/museum/domain/ports/museum-enrichment-cache.port';

// Re-exported (identity-preserving, spec R5) — the result type moved to
// `domain/ports/enrichment-usecases.port.ts` (C1 close, run
// 2026-06-04-hexagonal-boundaries-enforcement).
export type { PurgeDeadEnrichmentsResult };

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

/**
 * Hard-delete ceiling of the hybrid TTL policy. Invoked daily AFTER the
 * refresh scan so newly-refreshed rows are never caught by the same pass.
 * Fail-open: persistence errors logged + swallowed.
 */
export class PurgeDeadEnrichmentsUseCase implements PurgeDeadEnrichmentsPort {
  constructor(private readonly cache: MuseumEnrichmentCachePort) {}

  /**
   * @param now Clock override for tests. Defaults to `new Date()`.
   * @param thresholdDays Rows older than `now − thresholdDays` are removed.
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
