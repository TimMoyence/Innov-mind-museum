import { Queue } from 'bullmq';

import { logger } from '@shared/logger/logger';

import type {
  MuseumEnrichmentJob,
  MuseumEnrichmentJobStatus,
  MuseumEnrichmentQueuePort,
} from '@modules/museum/domain/ports/museum-enrichment-queue.port';
import type { ConnectionOptions } from 'bullmq';

export const MUSEUM_ENRICHMENT_QUEUE_NAME = 'museum-enrichment';

/** Stable jobId that doubles as BullMQ dedup key. */
const jobIdFor = (input: MuseumEnrichmentJob): string =>
  `mus:${String(input.museumId)}:${input.locale}`;

/**
 * jobId doubles as dedup key — BullMQ rejects a second `add()` with the same
 * jobId while the first is active, giving free idempotency on `(museumId, locale)`.
 */
export class BullmqMuseumEnrichmentQueueAdapter implements MuseumEnrichmentQueuePort {
  private readonly queue: Queue<MuseumEnrichmentJob>;

  constructor(connection: ConnectionOptions) {
    this.queue = new Queue<MuseumEnrichmentJob>(MUSEUM_ENRICHMENT_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
      },
    });
  }

  /**
   * Fail-open: logs and returns the jobId even if the enqueue fails — caller
   * sees a "pending" response and can retry on the next request.
   */
  async enqueue(input: MuseumEnrichmentJob): Promise<string> {
    const jobId = jobIdFor(input);
    try {
      await this.queue.add('enrich', input, { jobId });
      logger.info('museum_enrichment_enqueued', { jobId });
    } catch (err) {
      logger.warn('museum_enrichment_enqueue_error', {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return jobId;
  }

  async getJobStatus(jobId: string): Promise<MuseumEnrichmentJobStatus> {
    const job = await this.queue.getJob(jobId);
    if (!job) return 'notfound';
    const state = await job.getState();
    if (state === 'completed') return 'completed';
    if (state === 'failed') return 'failed';
    return 'active';
  }

  /** Returns null when no active job (completed/failed treated as "not running"). */
  async isJobActive(input: MuseumEnrichmentJob): Promise<string | null> {
    const jobId = jobIdFor(input);
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    if (state === 'completed' || state === 'failed') return null;
    return jobId;
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
