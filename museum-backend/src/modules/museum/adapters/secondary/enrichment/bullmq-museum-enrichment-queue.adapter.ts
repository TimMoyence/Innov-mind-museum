import { Queue } from 'bullmq';

import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import type {
  MuseumEnrichmentJob,
  MuseumEnrichmentJobStatus,
  MuseumEnrichmentQueuePort,
} from '@modules/museum/domain/ports/museum-enrichment-queue.port';
import type { ConnectionOptions } from 'bullmq';

export const MUSEUM_ENRICHMENT_QUEUE_NAME = 'museum-enrichment';

const jobIdFor = (input: MuseumEnrichmentJob): string =>
  `mus:${String(input.museumId)}:${input.locale}`;

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

  async enqueue(input: MuseumEnrichmentJob): Promise<string> {
    const jobId = jobIdFor(input);
    try {
      await this.queue.add('enrich', input, { jobId });
      logger.info('museum_enrichment_enqueued', { jobId });
    } catch (err) {
      logger.warn('museum_enrichment_enqueue_error', {
        jobId,
        error: errorMessage(err),
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
