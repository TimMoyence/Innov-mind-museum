import { logger } from '@shared/logger/logger';

import type {
  RefreshStaleEnrichmentsPort,
  RefreshStaleEnrichmentsResult,
} from '@modules/museum/domain/ports/enrichment-usecases.port';
import type { MuseumEnrichmentCachePort } from '@modules/museum/domain/ports/museum-enrichment-cache.port';
import type { MuseumEnrichmentQueuePort } from '@modules/museum/domain/ports/museum-enrichment-queue.port';

// Re-exported (identity-preserving, spec R5) — the result type moved to
// `domain/ports/enrichment-usecases.port.ts` (C1 close, run
// 2026-06-04-hexagonal-boundaries-enforcement).
export type { RefreshStaleEnrichmentsResult };

/**
 * 180 days (6 months) — upper bound before daily scan force-refresh. 30-day
 * floor remains the per-request cache window in `EnrichMuseumUseCase`.
 */
export const STALE_ENRICHMENT_THRESHOLD_DAYS = 180;

/**
 * Caps outbound Wikidata/Wikipedia/OSM load at ~100 museums/day to stay
 * under Wikidata user-agent rate-limit guidance (P3 spec).
 */
export const SCAN_BATCH_SIZE = 100;

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

/**
 * Skips already-active `(museumId, locale)` jobs up-front (queue dedup key
 * makes enqueue safe regardless, but this avoids log + queue churn). Safe
 * concurrent with on-demand requests: both paths share the same jobId dedup.
 */
export class RefreshStaleEnrichmentsUseCase implements RefreshStaleEnrichmentsPort {
  constructor(
    private readonly cache: MuseumEnrichmentCachePort,
    private readonly queue: MuseumEnrichmentQueuePort,
  ) {}

  /** @param now Clock override for tests. Defaults to `new Date()`. */
  async execute(now: Date = new Date()): Promise<RefreshStaleEnrichmentsResult> {
    const threshold = new Date(now.getTime() - STALE_ENRICHMENT_THRESHOLD_DAYS * MS_PER_DAY);
    const staleRows = await this.cache.findStaleRows(threshold, SCAN_BATCH_SIZE);

    let enqueued = 0;
    let skipped = 0;

    for (const row of staleRows) {
      const existingJobId = await this.queue.isJobActive({
        museumId: row.museumId,
        locale: row.locale,
      });
      if (existingJobId) {
        skipped++;
        continue;
      }
      await this.queue.enqueue({ museumId: row.museumId, locale: row.locale });
      enqueued++;
    }

    logger.info('refresh_stale_enrichments_scan', {
      threshold: threshold.toISOString(),
      found: staleRows.length,
      enqueued,
      skipped,
    });

    return { enqueued, skipped };
  }
}
