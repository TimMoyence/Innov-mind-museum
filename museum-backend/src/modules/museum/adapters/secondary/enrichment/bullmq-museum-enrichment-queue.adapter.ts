import { Queue } from 'bullmq';

import { logger } from '@shared/logger/logger';

import type {
  MuseumEnrichmentJob,
  MuseumEnrichmentJobStatus,
  MuseumEnrichmentQueuePort,
} from '../../../domain/ports/museum-enrichment-queue.port';
import type { ConnectionOptions } from 'bullmq';

export const MUSEUM_ENRICHMENT_QUEUE_NAME = 'museum-enrichment';

/** Stable jobId that doubles as BullMQ dedup key. */
const jobIdFor = (input: MuseumEnrichmentJob): string =>
  `mus:${String(input.museumId)}:${input.locale}`;

/**
 * BullMQ-backed adapter for {@link MuseumEnrichmentQueuePort}.
 *
 * Uses the jobId as dedup key — BullMQ rejects a second `add()` with the same
 * jobId while the first is still active, which gives us free idempotency on
 * `(museumId, locale)`.
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
   * Adds an enrichment job to the queue using a deterministic jobId so
   * duplicate `(museumId, locale)` requests collapse into a single active job.
   * Fail-open: logs and returns the jobId even if the enqueue fails — the
   * caller then sees a "pending" response and can retry on the next request.
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

  /**
   * Maps the live BullMQ job state onto the port-level status enum
   * (`completed` / `failed` / `active` / `notfound`).
   */
  async getJobStatus(jobId: string): Promise<MuseumEnrichmentJobStatus> {
    const job = await this.queue.getJob(jobId);
    if (!job) return 'notfound';
    const state = await job.getState();
    if (state === 'completed') return 'completed';
    if (state === 'failed') return 'failed';
    return 'active';
  }

  /**
   * Returns the jobId of an in-flight job for the given (museumId, locale)
   * pair, or `null` if no active job exists (including completed/failed
   * terminal states, which are treated as "no longer running").
   */
  async isJobActive(input: MuseumEnrichmentJob): Promise<string | null> {
    const jobId = jobIdFor(input);
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    if (state === 'completed' || state === 'failed') return null;
    return jobId;
  }

  /** Gracefully releases the queue connection. Call on app shutdown. */
  async close(): Promise<void> {
    await this.queue.close();
  }
}
