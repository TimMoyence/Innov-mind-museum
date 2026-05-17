import { Worker } from 'bullmq';

import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';
import { handleJobFailure } from '@shared/queue/job-failure.handler';

import { runAuditIpAnonymizer } from './audit-ip-anonymizer.job';

import type { Job, Queue, ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

/** Stable BullMQ repeatable-job id — `upsertJobScheduler` makes reboot idempotent. */
export const AUDIT_IP_ANONYMIZE_SCHEDULER_ID = 'audit-ip-anonymize';

const onAuditCronJobFailed = (job: Job | undefined, err: Error): void => {
  handleJobFailure(
    job
      ? {
          id: job.id,
          data: {},
          attemptsMade: job.attemptsMade,
          opts: { attempts: job.opts.attempts },
        }
      : null,
    err,
    {
      log: (event, meta) => {
        logger.warn(event, meta);
      },
      capture: captureExceptionWithContext,
    },
    {
      queueName: AUDIT_IP_ANONYMIZE_SCHEDULER_ID,
      // Empty summary — cron has no per-job payload; avoids legacy KE `url` default.
      summarize: () => ({}),
      // Cron has no retries — every failure must page Sentry.
      treatNoAttemptsAsFinal: true,
    },
  );
};

/** Daily at 03:00 UTC — off-peak, before other retention / enrichment sweeps. */
export const DEFAULT_AUDIT_IP_CRON = '0 3 * * *';

export interface AuditCronConfig {
  connection: ConnectionOptions;
  /** Defaults to {@link DEFAULT_AUDIT_IP_CRON}. */
  cron?: string;
}

export interface AuditCronHandle {
  /** Best-effort unregister + worker close on SIGTERM. */
  stop: () => Promise<void>;
}

/**
 * Registers daily audit-IP anonymization cron + dedicated worker.
 * Mirrors `BullmqEnrichmentSchedulerAdapter` for operator consistency.
 */
export async function registerAuditCron(
  queue: Queue,
  dataSource: DataSource,
  config: AuditCronConfig,
): Promise<AuditCronHandle> {
  const cron = config.cron ?? DEFAULT_AUDIT_IP_CRON;

  try {
    await queue.upsertJobScheduler(
      AUDIT_IP_ANONYMIZE_SCHEDULER_ID,
      { pattern: cron },
      {
        name: AUDIT_IP_ANONYMIZE_SCHEDULER_ID,
        data: {},
        opts: { removeOnComplete: 50, removeOnFail: 100 },
      },
    );
    logger.info('audit_cron_registered', {
      cron,
      schedulerId: AUDIT_IP_ANONYMIZE_SCHEDULER_ID,
    });
  } catch (err) {
    logger.error('audit_cron_register_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    captureExceptionWithContext(err instanceof Error ? err : new Error(String(err)), {
      schedulerId: AUDIT_IP_ANONYMIZE_SCHEDULER_ID,
    });
    return {
      // no-op — scheduler never registered
      stop: () => Promise.resolve(),
    };
  }

  const worker = new Worker(
    queue.name,
    async () => {
      const result = await runAuditIpAnonymizer(dataSource);
      logger.info('audit_cron_tick_completed', { anonymized: result.anonymized });
    },
    { connection: config.connection, concurrency: 1 },
  );

  worker.on('failed', onAuditCronJobFailed);

  return {
    stop: async () => {
      try {
        await queue.removeJobScheduler(AUDIT_IP_ANONYMIZE_SCHEDULER_ID);
      } catch (err) {
        logger.warn('audit_cron_remove_failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        await worker.close();
      } catch (err) {
        logger.warn('audit_cron_worker_close_failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}
