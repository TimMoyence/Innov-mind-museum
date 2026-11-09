import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import type {
  PurgeDeadEnrichmentsPort,
  PurgeDeadEnrichmentsResult,
} from '@modules/museum/domain/ports/enrichment-usecases.port';
import type { MuseumEnrichmentCachePort } from '@modules/museum/domain/ports/museum-enrichment-cache.port';

export type { PurgeDeadEnrichmentsResult };

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

export class PurgeDeadEnrichmentsUseCase implements PurgeDeadEnrichmentsPort {
  constructor(private readonly cache: MuseumEnrichmentCachePort) {}

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
        error: errorMessage(err),
      });
      return { deleted: 0 };
    }
  }
}
