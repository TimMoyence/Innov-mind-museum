import { Queue, Worker } from 'bullmq';

import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';

import type { EnrichmentSchedulerPort } from '../../../domain/ports/enrichment-scheduler.port';
import type { PurgeDeadEnrichmentsUseCase } from '../../../useCase/enrichment/purgeDeadEnrichments.useCase';
import type { RefreshStaleEnrichmentsUseCase } from '../../../useCase/enrichment/refreshStaleEnrichments.useCase';
import type { ConnectionOptions } from 'bullmq';

/** Dedicated queue used only by the stale-enrichment scan scheduler. */
export const ENRICHMENT_SCHEDULER_QUEUE_NAME = 'museum-enrichment-scheduler';

/** Stable scheduler key — BullMQ upserts on this id so re-boot = idempotent. */
export const STALE_ENRICHMENT_SCAN_SCHEDULER_ID = 'stale-enrichment-scan';

/** Daily at 03:00 UTC — off-peak window, well before Wikidata replication (06:00 UTC). */
export const DEFAULT_STALE_ENRICHMENT_CRON = '0 3 * * *';

/** Config injected at boot — keeps the adapter test-friendly. */
export interface BullmqEnrichmentSchedulerConfig {
  connection: ConnectionOptions;
  /** Cron pattern override. Defaults to {@link DEFAULT_STALE_ENRICHMENT_CRON}. */
  cron?: string;
}

/**
 * BullMQ-backed implementation of {@link EnrichmentSchedulerPort}.
 *
 * Uses `Queue.upsertJobScheduler` (BullMQ v5) to register a recurring job that
 * fires the `RefreshStaleEnrichmentsUseCase`. A dedicated `Worker` consumes
 * the fired jobs and invokes the use case — we deliberately run this on its
 * own queue (not the main `museum-enrichment` queue) so scheduler ticks never
 * interleave with on-demand enrichment jobs or compete for the same worker
 * concurrency budget.
 */
export class BullmqEnrichmentSchedulerAdapter implements EnrichmentSchedulerPort {
  private readonly queue: Queue;
  private worker?: Worker;
  private started = false;

  constructor(
    private readonly useCase: RefreshStaleEnrichmentsUseCase,
    private readonly config: BullmqEnrichmentSchedulerConfig,
    private readonly purgeUseCase?: PurgeDeadEnrichmentsUseCase,
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

  /**
   * Registers the recurring scheduler on the queue + spawns the worker that
   * executes each tick. Idempotent across restarts thanks to
   * `upsertJobScheduler` and the stable scheduler id.
   */
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
        error: err instanceof Error ? err.message : String(err),
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
        // Purge runs AFTER the refresh so rows newly re-fetched in this tick
        // are never caught by the same pass. Skipped when no purge use case or
        // threshold was wired — keeps the scheduler backward-compatible.
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
  }

  /**
   * Removes the scheduler + closes the worker + queue connections. Safe to
   * call during graceful shutdown — best-effort on each step so a failure
   * draining one resource doesn't leak the others.
   */
  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    try {
      await this.queue.removeJobScheduler(STALE_ENRICHMENT_SCAN_SCHEDULER_ID);
    } catch (err) {
      logger.warn('enrichment_scheduler_remove_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (this.worker) {
      try {
        await this.worker.close();
      } catch (err) {
        logger.warn('enrichment_scheduler_worker_close_failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      this.worker = undefined;
    }

    try {
      await this.queue.close();
    } catch (err) {
      logger.warn('enrichment_scheduler_queue_close_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    logger.info('enrichment_scheduler_stopped');
  }
}
