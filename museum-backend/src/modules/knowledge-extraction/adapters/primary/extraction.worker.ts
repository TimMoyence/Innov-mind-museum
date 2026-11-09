import { Queue, Worker } from 'bullmq';

import { canonicalizeUrl } from '@modules/knowledge-extraction/domain/extracted-content/canonical-url';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';
import { reportBullmqErrors } from '@shared/queue/bullmq-errors';
import {
  handleJobFailure,
  type FailedJobSnapshot,
  type JobFailureSinks,
} from '@shared/queue/job-failure.handler';

import type {
  ExtractionJobPayload,
  ExtractionQueuePort,
} from '@modules/knowledge-extraction/domain/ports/extraction-queue.port';
import type { ExtractionJobService } from '@modules/knowledge-extraction/useCase/extraction/extraction-job.service';

export type { FailedJobSnapshot, JobFailureSinks };
export { handleJobFailure };

const QUEUE_NAME = 'knowledge-extraction';

interface ExtractionWorkerConfig {
  concurrency: number;
  rateLimitMax: number;
  connection: {
    host: string;
    port: number;
    password?: string;
    maxRetriesPerRequest?: number | null;
    enableOfflineQueue?: boolean;
  };
}

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
    reportBullmqErrors(this.queue, 'queue_error');
  }

  start(): void {
    this.worker = new Worker<ExtractionJobPayload>(
      QUEUE_NAME,
      async (job) => {
        const { url, locale } = job.data;
        logger.info('extraction_job_start', { url, jobId: job.id });
        await this.jobService.processUrl(url, locale);
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
      handleJobFailure(
        job
          ? {
              id: job.id,
              data: { url: job.data.url },
              attemptsMade: job.attemptsMade,
              opts: { attempts: job.opts.attempts },
            }
          : null,
        err,
        {
          log: (e, m) => {
            logger.warn(e, m);
          },
          capture: captureExceptionWithContext,
        },
        {
          queueName: QUEUE_NAME,
          summarize: (data) => ({ url: data.url }),
        },
      );
    });

    reportBullmqErrors(this.worker, 'worker_error');

    logger.info('extraction_worker_started', {
      concurrency: this.config.concurrency,
      rateLimitMax: this.config.rateLimitMax,
    });
  }

  async enqueueUrls(jobs: ExtractionJobPayload[]): Promise<void> {
    try {
      await this.queue.addBulk(
        jobs.map((payload) => ({
          name: 'extract',
          data: payload,
          opts: { jobId: `extract:${canonicalizeUrl(payload.url)}` },
        })),
      );
      logger.info('extraction_urls_enqueued', { count: jobs.length });
    } catch (err) {
      logger.warn('extraction_enqueue_error', {
        error: errorMessage(err),
        count: jobs.length,
      });
    }
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}
