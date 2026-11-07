import { Queue, Worker } from 'bullmq';

import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';
import { safeClose } from '@shared/queue/scheduled-jobs';

import type { ConnectionOptions } from 'bullmq';

export interface DailyPurgeCronConfig {
  logPrefix: string;
  queueName: string;
  schedulerId: string;
  cron: string;
  connection: ConnectionOptions;
  createTick: () => () => Promise<unknown>;
}

export interface DailyPurgeCronHandle {
  stop: () => Promise<void>;
}

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

async function registerScheduler(queue: Queue, cfg: DailyPurgeCronConfig): Promise<boolean> {
  try {
    await queue.upsertJobScheduler(
      cfg.schedulerId,
      { pattern: cfg.cron },
      { name: 'purge', data: {}, opts: { removeOnComplete: 50, removeOnFail: 100 } },
    );
    logger.info(`${cfg.logPrefix}_scheduler_started`, {
      cron: cfg.cron,
      schedulerId: cfg.schedulerId,
    });
    return true;
  } catch (err) {
    logger.error(`${cfg.logPrefix}_scheduler_start_failed`, { error: toError(err).message });
    captureExceptionWithContext(toError(err), { queue: cfg.queueName });
    await safeClose(`${cfg.logPrefix}_queue_close_failed`, () => queue.close());
    return false;
  }
}

function spawnWorker(cfg: DailyPurgeCronConfig): Worker {
  const worker = new Worker(cfg.queueName, cfg.createTick(), {
    connection: cfg.connection,
    concurrency: 1,
  });
  worker.on('failed', (job, err) => {
    logger.warn(`${cfg.logPrefix}_tick_failed`, { jobId: job?.id, error: err.message });
    captureExceptionWithContext(err, { queue: cfg.queueName, jobId: job?.id });
  });
  worker.on('error', (err) => {
    captureExceptionWithContext(err, { queue: cfg.queueName, kind: 'worker_error' });
  });
  return worker;
}

export async function registerDailyPurgeCron(
  cfg: DailyPurgeCronConfig,
): Promise<DailyPurgeCronHandle> {
  const queue = new Queue(cfg.queueName, {
    connection: cfg.connection,
    defaultJobOptions: { removeOnComplete: 50, removeOnFail: 100 },
  });

  if (!(await registerScheduler(queue, cfg))) return { stop: () => Promise.resolve() };

  const worker = spawnWorker(cfg);

  return {
    stop: async () => {
      await safeClose(`${cfg.logPrefix}_scheduler_remove_failed`, () =>
        queue.removeJobScheduler(cfg.schedulerId),
      );
      await safeClose(`${cfg.logPrefix}_worker_close_failed`, () => worker.close());
      await safeClose(`${cfg.logPrefix}_queue_close_failed`, () => queue.close());
      logger.info(`${cfg.logPrefix}_scheduler_stopped`);
    },
  };
}
