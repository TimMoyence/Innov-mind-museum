import { Worker } from 'bullmq';

import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';
import { reportBullmqErrors } from '@shared/queue/bullmq-errors';
import { handleJobFailure } from '@shared/queue/job-failure.handler';

import { runAuditIpAnonymizer } from './audit-ip-anonymizer.job';

import type { Job, Queue, ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

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
      summarize: () => ({}),
      treatNoAttemptsAsFinal: true,
    },
  );
};

export const DEFAULT_AUDIT_IP_CRON = '0 3 * * *';

export interface AuditCronConfig {
  connection: ConnectionOptions;
  cron?: string;
}

export interface AuditCronHandle {
  stop: () => Promise<void>;
}

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
      error: errorMessage(err),
    });
    captureExceptionWithContext(err instanceof Error ? err : new Error(String(err)), {
      schedulerId: AUDIT_IP_ANONYMIZE_SCHEDULER_ID,
    });
    return {
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
  reportBullmqErrors(worker, 'worker_error', { schedulerId: AUDIT_IP_ANONYMIZE_SCHEDULER_ID });

  return {
    stop: async () => {
      try {
        await queue.removeJobScheduler(AUDIT_IP_ANONYMIZE_SCHEDULER_ID);
      } catch (err) {
        logger.warn('audit_cron_remove_failed', {
          error: errorMessage(err),
        });
      }
      try {
        await worker.close();
      } catch (err) {
        logger.warn('audit_cron_worker_close_failed', {
          error: errorMessage(err),
        });
      }
    },
  };
}
