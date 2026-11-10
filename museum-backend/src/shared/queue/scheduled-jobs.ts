import { Queue, Worker } from 'bullmq';

import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';

import { reportBullmqErrors } from './bullmq-errors';
import { handleJobFailure, type JobFailureSinks } from './job-failure.handler';

import type { ConnectionOptions } from 'bullmq';

export interface ScheduledJobResult {
  rowsAffected: number;
  details?: Record<string, unknown>;
}

export interface ScheduledJobConfig {
  name: string;
  schedulerId?: string;
  cronPattern: string;
  handler: () => Promise<ScheduledJobResult | void>;
  connection: ConnectionOptions;
  attempts?: number;
}

export interface ScheduledJobHandle {
  start(): Promise<boolean>;
  close(): Promise<void>;
}

const DEFAULT_ATTEMPTS = 1;

const schedulerIdOf = (cfg: ScheduledJobConfig): string =>
  cfg.schedulerId ?? `${cfg.name}-scheduler`;

export async function safeClose(label: string, step: () => unknown): Promise<void> {
  try {
    await step();
  } catch (err) {
    logger.warn(label, { error: errorMessage(err) });
  }
}

async function registerScheduler(queue: Queue, cfg: ScheduledJobConfig): Promise<boolean> {
  try {
    await queue.upsertJobScheduler(
      schedulerIdOf(cfg),
      { pattern: cfg.cronPattern },
      { name: cfg.name, data: {}, opts: { removeOnComplete: 100, removeOnFail: 500 } },
    );
    logger.info('scheduled_job_registered', { job: cfg.name, cronPattern: cfg.cronPattern });
    return true;
  } catch (err) {
    logger.error('scheduled_job_register_failed', {
      job: cfg.name,
      error: errorMessage(err),
    });
    captureExceptionWithContext(err instanceof Error ? err : new Error(String(err)), {
      queue: cfg.name,
      kind: 'scheduler_register_failed',
    });
    return false;
  }
}

function buildSinks(): JobFailureSinks {
  return {
    log: (event, meta) => {
      logger.warn(event, meta);
    },
    capture: captureExceptionWithContext,
  };
}

function spawnWorker(cfg: ScheduledJobConfig): Worker {
  const sinks = buildSinks();

  const worker = new Worker(
    cfg.name,
    async (job) => {
      const result = await cfg.handler();
      logger.info('scheduled_job_completed', {
        job: cfg.name,
        jobId: job.id,
        rowsAffected: result?.rowsAffected,
        details: result?.details,
      });
      return result;
    },
    { connection: cfg.connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    handleJobFailure(
      job
        ? {
            id: job.id,
            data: { jobName: cfg.name },
            attemptsMade: job.attemptsMade,
            opts: { attempts: job.opts.attempts },
          }
        : null,
      err,
      sinks,
      {
        queueName: cfg.name,
        summarize: (data) => ({ jobName: (data as { jobName?: string }).jobName ?? cfg.name }),
        treatNoAttemptsAsFinal: true,
      },
    );
  });

  reportBullmqErrors(worker, 'worker_error');

  return worker;
}

export function registerScheduledJob(cfg: ScheduledJobConfig): ScheduledJobHandle {
  const queue = new Queue(cfg.name, {
    connection: cfg.connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: cfg.attempts ?? DEFAULT_ATTEMPTS,
    },
  });
  reportBullmqErrors(queue, 'queue_error');

  let worker: Worker | undefined;

  const start = async (): Promise<boolean> => {
    const registered = await registerScheduler(queue, cfg);
    if (registered) worker = spawnWorker(cfg);
    return registered;
  };

  const close = async (): Promise<void> => {
    await safeClose(`${cfg.name}_scheduler_remove_failed`, () =>
      queue.removeJobScheduler(schedulerIdOf(cfg)),
    );
    if (worker !== undefined) {
      const w = worker;
      await safeClose(`${cfg.name}_worker_close_failed`, () => w.close());
    }
    await safeClose(`${cfg.name}_queue_close_failed`, () => queue.close());
    logger.info('scheduled_job_stopped', { job: cfg.name });
  };

  return { start, close };
}
