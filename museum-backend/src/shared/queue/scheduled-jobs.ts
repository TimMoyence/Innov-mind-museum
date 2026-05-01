import { Queue, Worker } from 'bullmq';

import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';

import { handleJobFailure, type JobFailureSinks } from './job-failure.handler';

import type { ConnectionOptions } from 'bullmq';

/** Result returned by a scheduled-job handler — surfaced in logs and audit trails. */
export interface ScheduledJobResult {
  /** Number of rows / items processed. Used for log + metrics. */
  rowsAffected: number;
  /** Free-form per-job details (e.g. per-rule breakdown for retention prune). */
  details?: Record<string, unknown>;
}

/** Configuration for a single recurring job. */
export interface ScheduledJobConfig {
  /** Logical name (queue + log event). E.g. 'retention-prune-support-tickets'. */
  name: string;
  /** BullMQ cron pattern. E.g. '15 3 * * *' = 03:15 UTC daily. */
  cronPattern: string;
  /** The work to perform on each fire. Must be idempotent. */
  handler: () => Promise<ScheduledJobResult>;
  /** Redis connection options (reuse the project's BullMQ connection). */
  connection: ConnectionOptions;
  /**
   * Optional override of attempts. Defaults to 1 — scheduled jobs prefer
   * next-tick retry over inline retry to avoid blocking the queue.
   */
  attempts?: number;
}

/** Lifecycle handle for a registered scheduled job. */
export interface ScheduledJobHandle {
  start(): Promise<void>;
  close(): Promise<void>;
}

const DEFAULT_ATTEMPTS = 1;

/** Runs the given async teardown step, logging any error under `label` without rethrowing. */
async function safeClose(label: string, step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch (err) {
    logger.warn(label, { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Registers the repeatable BullMQ scheduler entry. Returns `true` when live,
 * `false` when registration failed (caller must not spawn a worker).
 */
async function registerScheduler(queue: Queue, cfg: ScheduledJobConfig): Promise<boolean> {
  try {
    await queue.upsertJobScheduler(
      `${cfg.name}-scheduler`,
      { pattern: cfg.cronPattern },
      { name: cfg.name, data: {}, opts: { removeOnComplete: 100, removeOnFail: 500 } },
    );
    logger.info('scheduled_job_registered', { job: cfg.name, cronPattern: cfg.cronPattern });
    return true;
  } catch (err) {
    logger.error('scheduled_job_register_failed', {
      job: cfg.name,
      error: err instanceof Error ? err.message : String(err),
    });
    captureExceptionWithContext(err instanceof Error ? err : new Error(String(err)), {
      queue: cfg.name,
      kind: 'scheduler_register_failed',
    });
    return false;
  }
}

/** Builds the shared failure-sinks for this job's worker. */
function buildSinks(): JobFailureSinks {
  return {
    log: (event, meta) => {
      logger.warn(event, meta);
    },
    capture: captureExceptionWithContext,
  };
}

/** Spawns the BullMQ worker that runs `cfg.handler` on every cron tick. */
function spawnWorker(cfg: ScheduledJobConfig): Worker {
  const sinks = buildSinks();

  const worker = new Worker(
    cfg.name,
    async (job) => {
      const result = await cfg.handler();
      logger.info('scheduled_job_completed', {
        job: cfg.name,
        jobId: job.id,
        rowsAffected: result.rowsAffected,
        details: result.details,
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

  worker.on('error', (err) => {
    captureExceptionWithContext(err, { queue: cfg.name, kind: 'worker_error' });
  });

  return worker;
}

/**
 * Registers a single recurring BullMQ job. Mirrors the pattern of
 * `audit-cron.registrar.ts` and `chat-purge-cron.registrar.ts`:
 * `upsertJobScheduler` for idempotent reboot, `removeOnComplete: 100`,
 * `removeOnFail: 500`, Sentry-on-final-failure via shared `handleJobFailure`.
 *
 * Each fire calls `handler()` once. Successful runs emit a structured
 * `scheduled_job_completed` log event with `rowsAffected` and `details`.
 * Failures are routed through `handleJobFailure` (logs warn + Sentry on final
 * since `treatNoAttemptsAsFinal: true` — scheduled jobs have no retries).
 *
 * BullMQ's Redis-backed scheduler guarantees only one worker fires the handler
 * per scheduled tick across replicas.
 */
export function registerScheduledJob(cfg: ScheduledJobConfig): ScheduledJobHandle {
  const queue = new Queue(cfg.name, {
    connection: cfg.connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: cfg.attempts ?? DEFAULT_ATTEMPTS,
    },
  });

  let worker: Worker | undefined;

  const start = async (): Promise<void> => {
    const registered = await registerScheduler(queue, cfg);
    if (!registered) return;
    worker = spawnWorker(cfg);
  };

  const close = async (): Promise<void> => {
    await safeClose(`${cfg.name}_scheduler_remove_failed`, () =>
      queue.removeJobScheduler(`${cfg.name}-scheduler`),
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
