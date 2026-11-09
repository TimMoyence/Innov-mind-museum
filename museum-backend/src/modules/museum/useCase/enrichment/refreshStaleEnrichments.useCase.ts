import { logger } from '@shared/logger/logger';

import type {
  RefreshStaleEnrichmentsPort,
  RefreshStaleEnrichmentsResult,
} from '@modules/museum/domain/ports/enrichment-usecases.port';
import type { MuseumEnrichmentCachePort } from '@modules/museum/domain/ports/museum-enrichment-cache.port';
import type { MuseumEnrichmentQueuePort } from '@modules/museum/domain/ports/museum-enrichment-queue.port';

export type { RefreshStaleEnrichmentsResult };

export const STALE_ENRICHMENT_THRESHOLD_DAYS = 180;

export const SCAN_BATCH_SIZE = 100;

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

export class RefreshStaleEnrichmentsUseCase implements RefreshStaleEnrichmentsPort {
  constructor(
    private readonly cache: MuseumEnrichmentCachePort,
    private readonly queue: MuseumEnrichmentQueuePort,
  ) {}

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
