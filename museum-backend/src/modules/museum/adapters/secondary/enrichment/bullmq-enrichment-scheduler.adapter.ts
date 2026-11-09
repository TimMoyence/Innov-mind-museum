import { Queue, Worker } from 'bullmq';

import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';

import type { EnrichmentSchedulerPort } from '@modules/museum/domain/ports/enrichment-scheduler.port';
import type {
  PurgeDeadEnrichmentsPort,
  RefreshStaleEnrichmentsPort,
} from '@modules/museum/domain/ports/enrichment-usecases.port';
import type { ConnectionOptions } from 'bullmq';

export const ENRICHMENT_SCHEDULER_QUEUE_NAME = 'museum-enrichment-scheduler';

export const STALE_ENRICHMENT_SCAN_SCHEDULER_ID = 'stale-enrichment-scan';

export const DEFAULT_STALE_ENRICHMENT_CRON = '0 3 * * *';

export interface BullmqEnrichmentSchedulerConfig {
  connection: ConnectionOptions;
  cron?: string;
}

export class BullmqEnrichmentSchedulerAdapter implements EnrichmentSchedulerPort {
  private readonly queue: Queue;
  private worker?: Worker;
  private started = false;

  constructor(
    private readonly useCase: RefreshStaleEnrichmentsPort,
    private readonly config: BullmqEnrichmentSchedulerConfig,
    private readonly purgeUseCase?: PurgeDeadEnrichmentsPort,
    private readonly purgeThresholdDays?: number,
  ) {
    this.queue = new Queue(ENRICHMENT_SCHEDULER_QUEUE_NAME, {
      connection: config.connection,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const cron = this.config.cron ?? DEFAULT_STALE_ENRICHMENT_CRON;

    try {
      await this.queue.upsertJobScheduler(
        STALE_ENRICHMENT_SCAN_SCHEDULER_ID,
        { pattern: cron },
        { name: 'scan', data: {}, opts: { removeOnComplete: 50, removeOnFail: 100 } },
      );
      logger.info('enrichment_scheduler_started', {
        cron,
        schedulerId: STALE_ENRICHMENT_SCAN_SCHEDULER_ID,
      });
    } catch (err) {
      logger.error('enrichment_scheduler_start_failed', {
        error: errorMessage(err),
      });
      captureExceptionWithContext(err instanceof Error ? err : new Error(String(err)), {
        queue: ENRICHMENT_SCHEDULER_QUEUE_NAME,
      });
      this.started = false;
      return;
    }

    this.worker = new Worker(
      ENRICHMENT_SCHEDULER_QUEUE_NAME,
      async () => {
        const result = await this.useCase.execute();
        let purged = 0;
        if (this.purgeUseCase && this.purgeThresholdDays !== undefined) {
          const purgeResult = await this.purgeUseCase.execute(new Date(), this.purgeThresholdDays);
          purged = purgeResult.deleted;
        }
        logger.info('enrichment_scheduler_tick_completed', { ...result, purged });
      },
      { connection: this.config.connection, concurrency: 1 },
    );

    this.worker.on('failed', (job, err) => {
      logger.warn('enrichment_scheduler_tick_failed', {
        jobId: job?.id,
        error: err.message,
      });
      captureExceptionWithContext(err, {
        queue: ENRICHMENT_SCHEDULER_QUEUE_NAME,
        jobId: job?.id,
      });
    });
    this.worker.on('error', (err) => {
      captureExceptionWithContext(err, {
        queue: ENRICHMENT_SCHEDULER_QUEUE_NAME,
        kind: 'worker_error',
      });
    });
    try {
      await this.worker.waitUntilReady();
    } catch (err) {
      await this.stop();
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.started) {
      this.started = false;
      try {
        await this.queue.removeJobScheduler(STALE_ENRICHMENT_SCAN_SCHEDULER_ID);
      } catch (err) {
        logger.warn('enrichment_scheduler_remove_failed', {
          error: errorMessage(err),
        });
      }
    }

    if (this.worker) {
      try {
        await this.worker.close();
      } catch (err) {
        logger.warn('enrichment_scheduler_worker_close_failed', {
          error: errorMessage(err),
        });
      }
      this.worker = undefined;
    }

    try {
      await this.queue.close();
    } catch (err) {
      logger.warn('enrichment_scheduler_queue_close_failed', {
        error: errorMessage(err),
      });
    }

    logger.info('enrichment_scheduler_stopped');
  }
}
