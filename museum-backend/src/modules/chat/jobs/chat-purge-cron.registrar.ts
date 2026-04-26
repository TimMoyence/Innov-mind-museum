import { Queue, Worker } from 'bullmq';

import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';

import { buildChatMediaPurgerFromEnv } from './chat-media-purger';
import { runChatPurge } from './chat-purge.job';

import type { ChatMediaPurger } from './chat-media-purger';
import type { ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

/** Dedicated BullMQ queue for the chat-purge retention cron. */
export const CHAT_PURGE_QUEUE_NAME = 'chat-purge-scheduler';

/** Stable scheduler id — BullMQ upserts on this key so reboot = idempotent. */
export const CHAT_PURGE_SCHEDULER_ID = 'chat-purge-daily';

/** Daily at 04:00 UTC — off-peak window, after the 03:00 enrichment scan. */
export const DEFAULT_CHAT_PURGE_CRON = '0 4 * * *';

/** Config accepted by {@link registerChatPurgeCron}. */
export interface ChatPurgeCronConfig {
  /** BullMQ connection (shared with the rest of the Redis stack). */
  connection: ConnectionOptions;
  /** Retention window in days (forwarded to {@link runChatPurge}). */
  retentionDays?: number;
  /** Cron pattern override. Defaults to {@link DEFAULT_CHAT_PURGE_CRON}. */
  cron?: string;
  /**
   * Media purger override. When omitted, one is built from `env.storage`. The
   * override is wired by integration tests so they can stub the S3 calls
   * without mutating env.
   */
  mediaPurger?: ChatMediaPurger;
}

/** Handle returned by the registrar for graceful shutdown wiring. */
export interface ChatPurgeCronHandle {
  /** Tears down the worker + queue. Safe to call multiple times. */
  stop: () => Promise<void>;
}

/** Runs the given async teardown step, logging any error under `label` without rethrowing. */
async function safeClose(label: string, step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch (err) {
    logger.warn(label, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Registers the repeatable scheduler on the freshly created queue.
 *
 * @returns `true` when the scheduler is live and the caller can spawn a worker;
 *   `false` when registration failed (queue already closed by this helper).
 */
async function registerScheduler(queue: Queue, cron: string): Promise<boolean> {
  try {
    await queue.upsertJobScheduler(
      CHAT_PURGE_SCHEDULER_ID,
      { pattern: cron },
      { name: 'purge', data: {}, opts: { removeOnComplete: 50, removeOnFail: 100 } },
    );
    logger.info('chat_purge_scheduler_started', {
      cron,
      schedulerId: CHAT_PURGE_SCHEDULER_ID,
    });
    return true;
  } catch (err) {
    logger.error('chat_purge_scheduler_start_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    captureExceptionWithContext(err instanceof Error ? err : new Error(String(err)), {
      queue: CHAT_PURGE_QUEUE_NAME,
    });
    await safeClose('chat_purge_queue_close_failed', () => queue.close());
    return false;
  }
}

/** Spawns the dedicated worker that executes `runChatPurge` on every cron tick. */
function spawnPurgeWorker(dataSource: DataSource, config: ChatPurgeCronConfig): Worker {
  // Resolve the media purger once at boot so the worker doesn't re-read
  // `process.env` on every tick. Tests can inject a stub via `config.mediaPurger`.
  const mediaPurger = config.mediaPurger ?? buildChatMediaPurgerFromEnv();
  const worker = new Worker(
    CHAT_PURGE_QUEUE_NAME,
    async () => {
      await runChatPurge(dataSource, { retentionDays: config.retentionDays, mediaPurger });
    },
    { connection: config.connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.warn('chat_purge_tick_failed', {
      jobId: job?.id,
      error: err.message,
    });
    captureExceptionWithContext(err, {
      queue: CHAT_PURGE_QUEUE_NAME,
      jobId: job?.id,
    });
  });

  return worker;
}

/**
 * Wires the daily chat-purge cron onto BullMQ. Mirrors the enrichment
 * scheduler pattern (dedicated queue + worker, `upsertJobScheduler` for
 * idempotent reboot, fail-open on registration errors).
 *
 * @param dataSource Live TypeORM DataSource used by the purge job.
 * @param config BullMQ connection + cron / retention overrides.
 * @returns Handle exposing a `stop()` hook for graceful shutdown.
 */
export async function registerChatPurgeCron(
  dataSource: DataSource,
  config: ChatPurgeCronConfig,
): Promise<ChatPurgeCronHandle> {
  const cron = config.cron ?? DEFAULT_CHAT_PURGE_CRON;
  const queue = new Queue(CHAT_PURGE_QUEUE_NAME, {
    connection: config.connection,
    defaultJobOptions: { removeOnComplete: 50, removeOnFail: 100 },
  });

  const registered = await registerScheduler(queue, cron);
  if (!registered) {
    return {
      // no-op — scheduler never registered, queue already closed in registerScheduler
      stop: () => Promise.resolve(),
    };
  }

  const worker = spawnPurgeWorker(dataSource, config);

  return {
    stop: async () => {
      await safeClose('chat_purge_scheduler_remove_failed', () =>
        queue.removeJobScheduler(CHAT_PURGE_SCHEDULER_ID),
      );
      await safeClose('chat_purge_worker_close_failed', () => worker.close());
      await safeClose('chat_purge_queue_close_failed', () => queue.close());
      logger.info('chat_purge_scheduler_stopped');
    },
  };
}
