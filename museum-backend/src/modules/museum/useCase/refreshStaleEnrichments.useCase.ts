import { logger } from '@shared/logger/logger';

import type { MuseumEnrichmentCachePort } from '../domain/ports/museum-enrichment-cache.port';
import type { MuseumEnrichmentQueuePort } from '../domain/ports/museum-enrichment-queue.port';

/**
 * TTL ceiling for cached enrichment rows: 180 days (6 months). Upper bound on
 * how stale data can become before the daily scan force-refreshes it. Floor of
 * 30 days remains the per-request cache window in `EnrichMuseumUseCase`.
 */
export const STALE_ENRICHMENT_THRESHOLD_DAYS = 180;

/**
 * Maximum number of rows refreshed per scan. Caps the outbound Wikidata /
 * Wikipedia / OSM load at ~100 museums per day so we stay well under the
 * Wikidata user-agent rate-limit guidance (see P3 spec).
 */
export const SCAN_BATCH_SIZE = 100;

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

/** Aggregate counters returned by a scan pass — useful for tests + logs. */
export interface RefreshStaleEnrichmentsResult {
  enqueued: number;
  skipped: number;
}

/**
 * Scans the `museum_enrichment` cache for rows older than
 * {@link STALE_ENRICHMENT_THRESHOLD_DAYS} and enqueues refresh jobs for each.
 * Jobs already in-flight for the same `(museumId, locale)` pair are skipped
 * — the queue adapter's dedup key makes the enqueue call safe, but skipping
 * up-front avoids unnecessary logs + queue churn.
 *
 * Invoked daily by {@link EnrichmentSchedulerPort} implementations. Safe to
 * run concurrently with on-demand enrichment requests: both paths share the
 * same jobId dedup key.
 */
export class RefreshStaleEnrichmentsUseCase {
  constructor(
    private readonly cache: MuseumEnrichmentCachePort,
    private readonly queue: MuseumEnrichmentQueuePort,
  ) {}

  /**
   * Runs a single scan pass.
   *
   * @param now Clock override for deterministic tests. Defaults to `new Date()`.
   */
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
