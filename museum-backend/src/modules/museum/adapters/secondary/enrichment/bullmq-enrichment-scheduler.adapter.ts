import { Queue, Worker } from 'bullmq';

import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';

import type { EnrichmentSchedulerPort } from '@modules/museum/domain/ports/enrichment-scheduler.port';
import type { PurgeDeadEnrichmentsUseCase } from '@modules/museum/useCase/enrichment/purgeDeadEnrichments.useCase';
import type { RefreshStaleEnrichmentsUseCase } from '@modules/museum/useCase/enrichment/refreshStaleEnrichments.useCase';
import type { ConnectionOptions } from 'bullmq';

export const ENRICHMENT_SCHEDULER_QUEUE_NAME = 'museum-enrichment-scheduler';

/** BullMQ upserts on this id so re-boot = idempotent. */
export const STALE_ENRICHMENT_SCAN_SCHEDULER_ID = 'stale-enrichment-scan';

/** Daily 03:00 UTC — off-peak, well before Wikidata replication (06:00 UTC). */
export const DEFAULT_STALE_ENRICHMENT_CRON = '0 3 * * *';

export interface BullmqEnrichmentSchedulerConfig {
  connection: ConnectionOptions;
  /** Defaults to {@link DEFAULT_STALE_ENRICHMENT_CRON}. */
  cron?: string;
}

/**
 * Runs on a dedicated queue (not the main `museum-enrichment` queue) so
 * scheduler ticks never interleave with on-demand enrichment jobs or compete
 * for the same concurrency budget. Uses BullMQ v5 `upsertJobScheduler`.
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

  /** Idempotent across restarts via `upsertJobScheduler` + stable scheduler id. */
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
        // Purge AFTER refresh so rows newly re-fetched are never caught by the
        // same pass. Skipped when no purge use case / threshold wired.
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
    // TD-BMQ-01 — mandatory worker 'error' listener (lib-docs/bullmq/PATTERNS.md §3 DO).
    this.worker.on('error', (err) => {
      captureExceptionWithContext(err, {
        queue: ENRICHMENT_SCHEDULER_QUEUE_NAME,
        kind: 'worker_error',
      });
    });
  }

  /** Best-effort on each step so a failure draining one resource doesn't leak the others. */
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
