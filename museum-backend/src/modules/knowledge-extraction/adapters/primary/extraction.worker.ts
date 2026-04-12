import { Queue, Worker } from 'bullmq';

import { logger } from '@shared/logger/logger';

import type {
  ExtractionJobPayload,
  ExtractionQueuePort,
} from '../../domain/ports/extraction-queue.port';
import type { ExtractionJobService } from '../../useCase/extraction-job.service';

const QUEUE_NAME = 'knowledge-extraction';

interface ExtractionWorkerConfig {
  concurrency: number;
  rateLimitMax: number;
  connection: {
    host: string;
    port: number;
    password?: string;
    /** BullMQ Worker requires this to be null (per BullMQ docs). */
    maxRetriesPerRequest?: number | null;
    /** Fail fast instead of buffering commands when Redis is unreachable. */
    enableOfflineQueue?: boolean;
  };
}

/**
 * BullMQ-based extraction queue and worker.
 *
 * Implements {@link ExtractionQueuePort} for enqueuing URLs (fire-and-forget)
 * and runs a worker that processes jobs via {@link ExtractionJobService}.
 */
export class ExtractionWorker implements ExtractionQueuePort {
  private readonly queue: Queue<ExtractionJobPayload>;
  private worker?: Worker<ExtractionJobPayload>;

  constructor(
    private readonly jobService: ExtractionJobService,
    private readonly config: ExtractionWorkerConfig,
  ) {
    this.queue = new Queue(QUEUE_NAME, {
      connection: this.config.connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
      },
    });
  }

  /** Starts the BullMQ worker. Call once at app startup. */
  start(): void {
    this.worker = new Worker<ExtractionJobPayload>(
      QUEUE_NAME,
      async (job) => {
        const { url, searchTerm, locale } = job.data;
        logger.info('extraction_job_start', { url, jobId: job.id });
        await this.jobService.processUrl(url, searchTerm, locale);
      },
      {
        connection: this.config.connection,
        concurrency: this.config.concurrency,
        limiter: {
          max: this.config.rateLimitMax,
          duration: 60_000,
        },
      },
    );

    this.worker.on('completed', (job) => {
      logger.info('extraction_job_completed', { jobId: job.id, url: job.data.url });
    });

    this.worker.on('failed', (job, err) => {
      logger.warn('extraction_job_failed', {
        jobId: job?.id,
        url: job?.data.url,
        error: err.message,
      });
    });

    logger.info('extraction_worker_started', {
      concurrency: this.config.concurrency,
      rateLimitMax: this.config.rateLimitMax,
    });
  }

  /** Enqueues URLs for background extraction. Fire-and-forget — never blocks the chat. */
  async enqueueUrls(jobs: ExtractionJobPayload[]): Promise<void> {
    try {
      await this.queue.addBulk(
        jobs.map((payload) => ({
          name: 'extract',
          data: payload,
          opts: { jobId: `extract:${payload.url}` },
        })),
      );
      logger.info('extraction_urls_enqueued', { count: jobs.length });
    } catch (err) {
      logger.warn('extraction_enqueue_error', {
        error: err instanceof Error ? err.message : String(err),
        count: jobs.length,
      });
    }
  }

  /** Gracefully shuts down the worker and queue. */
  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}
