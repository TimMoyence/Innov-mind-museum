import { Queue, Worker } from 'bullmq';

import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';
import { env } from '@src/config/env';

import { runS3OrphanPurge } from './s3-orphan-purge.job';

import type { S3OrphanPurgeResult } from './s3-orphan-purge.job';
import type { S3ImageStorageConfig } from '../adapters/secondary/storage/s3-operations';
import type { ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

/** Dedicated BullMQ queue for the S3 orphan-purge retention cron. */
export const S3_ORPHAN_PURGE_QUEUE_NAME = 's3-orphan-purge-scheduler';

/** Stable scheduler id — BullMQ upserts on this key so reboot = idempotent. */
export const S3_ORPHAN_PURGE_SCHEDULER_ID = 's3-orphan-purge-daily';

/**
 * Daily at 04:30 UTC (D6) — offset from the chat-purge cron at 04:00 to avoid
 * same-tick S3 ListObjects contention.
 */
export const DEFAULT_S3_ORPHAN_PURGE_CRON = '30 4 * * *';

/** Tick runner signature — overridable in tests so no real S3/PG is touched. */
export type S3OrphanPurgeRunner = (
  dataSource: DataSource,
  opts: { s3Config: S3ImageStorageConfig; retentionDays: number },
) => Promise<S3OrphanPurgeResult>;

/** Config accepted by {@link registerS3OrphanPurgeCron}. */
export interface S3OrphanPurgeCronConfig {
  /** BullMQ connection (shared with the rest of the Redis stack). */
  connection: ConnectionOptions;
  /** Retention window in days (forwarded to {@link runS3OrphanPurge}). */
  retentionDays?: number;
  /** Cron pattern override. Defaults to {@link DEFAULT_S3_ORPHAN_PURGE_CRON}. */
  cron?: string;
  /** S3 config override (tests). When omitted, resolved from `env.storage.s3`. */
  s3Config?: S3ImageStorageConfig;
  /** Runner override (tests). Defaults to {@link runS3OrphanPurge}. */
  runner?: S3OrphanPurgeRunner;
}

/** Handle returned by the registrar for graceful shutdown wiring. */
export interface S3OrphanPurgeCronHandle {
  /** Tears down the worker + queue. Safe to call multiple times. */
  stop: () => Promise<void>;
}

/** Runs the given async teardown step, logging any error under `label` without rethrowing. */
async function safeClose(label: string, step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch (err) {
    logger.warn(label, { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Resolves the S3 storage config from `env.storage.s3`. Required fields fall
 * back to empty strings so a misconfigured environment never throws at boot —
 * the worker tick logs a warning and the actual S3 call (in {@link runS3OrphanPurge})
 * fails fast, routed to Sentry via the `'failed'` listener (fail-open, R11).
 */
function isS3ConfigComplete(s3: typeof env.storage.s3): boolean {
  if (env.storage.driver !== 's3' || !s3) return false;
  const required = [s3.endpoint, s3.region, s3.bucket, s3.accessKeyId, s3.secretAccessKey];
  return required.every((field) => typeof field === 'string' && field.length > 0);
}

/** Required-field fallback ('') — completeness validated by isS3ConfigComplete. */
const orEmpty = (value: string | undefined): string => value ?? '';

function resolveS3ConfigFromEnv(): { config: S3ImageStorageConfig; complete: boolean } {
  const s3 = env.storage.s3 ?? {};
  const config: S3ImageStorageConfig = {
    endpoint: orEmpty(s3.endpoint),
    region: orEmpty(s3.region),
    bucket: orEmpty(s3.bucket),
    accessKeyId: orEmpty(s3.accessKeyId),
    secretAccessKey: orEmpty(s3.secretAccessKey),
    signedUrlTtlSeconds: env.storage.signedUrlTtlSeconds,
    publicBaseUrl: s3.publicBaseUrl,
    sessionToken: s3.sessionToken,
    objectKeyPrefix: s3.objectKeyPrefix,
    requestTimeoutMs: env.requestTimeoutMs,
  };
  return { config, complete: isS3ConfigComplete(env.storage.s3) };
}

/**
 * Registers the repeatable scheduler on the freshly created queue.
 *
 * @returns `true` when live; `false` when registration failed (queue closed here).
 */
async function registerScheduler(queue: Queue, cron: string): Promise<boolean> {
  try {
    await queue.upsertJobScheduler(
      S3_ORPHAN_PURGE_SCHEDULER_ID,
      { pattern: cron },
      { name: 'purge', data: {}, opts: { removeOnComplete: 50, removeOnFail: 100 } },
    );
    logger.info('s3_orphan_purge_scheduler_started', {
      cron,
      schedulerId: S3_ORPHAN_PURGE_SCHEDULER_ID,
    });
    return true;
  } catch (err) {
    logger.error('s3_orphan_purge_scheduler_start_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    captureExceptionWithContext(err instanceof Error ? err : new Error(String(err)), {
      queue: S3_ORPHAN_PURGE_QUEUE_NAME,
    });
    await safeClose('s3_orphan_purge_queue_close_failed', () => queue.close());
    return false;
  }
}

/** Spawns the dedicated worker that runs the orphan purge on every cron tick. */
function spawnPurgeWorker(dataSource: DataSource, config: S3OrphanPurgeCronConfig): Worker {
  const runner = config.runner ?? runS3OrphanPurge;
  const resolved = config.s3Config
    ? { config: config.s3Config, complete: true }
    : resolveS3ConfigFromEnv();
  const retentionDays = config.retentionDays ?? env.s3OrphanPurgeRetentionDays;

  const worker = new Worker(
    S3_ORPHAN_PURGE_QUEUE_NAME,
    async () => {
      if (!resolved.complete) {
        // Fail-open: log the misconfiguration; the S3 call below fails fast and
        // is routed to Sentry by the `'failed'` listener rather than crashing.
        logger.warn('s3_orphan_purge_s3_misconfigured', {
          message: 'OBJECT_STORAGE_DRIVER=s3 settings incomplete — orphan sweep may no-op',
        });
      }
      await runner(dataSource, { s3Config: resolved.config, retentionDays });
    },
    { connection: config.connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.warn('s3_orphan_purge_tick_failed', { jobId: job?.id, error: err.message });
    captureExceptionWithContext(err, { queue: S3_ORPHAN_PURGE_QUEUE_NAME, jobId: job?.id });
  });
  // TD-BMQ-01 — mandatory worker 'error' listener (lib-docs/bullmq).
  worker.on('error', (err) => {
    captureExceptionWithContext(err, { queue: S3_ORPHAN_PURGE_QUEUE_NAME, kind: 'worker_error' });
  });

  return worker;
}

/**
 * B5 — wires the daily S3 orphan-purge cron onto BullMQ. Mirrors
 * `registerChatPurgeCron`: dedicated queue + worker, `upsertJobScheduler` for
 * idempotent reboot, fail-open on registration errors (no-op `stop()`, no throw).
 *
 * @param dataSource Live TypeORM DataSource used by the purge job.
 * @param config BullMQ connection + cron / retention / S3 overrides.
 * @returns Handle exposing a `stop()` hook for graceful shutdown.
 */
export async function registerS3OrphanPurgeCron(
  dataSource: DataSource,
  config: S3OrphanPurgeCronConfig,
): Promise<S3OrphanPurgeCronHandle> {
  const cron = config.cron ?? DEFAULT_S3_ORPHAN_PURGE_CRON;
  const queue = new Queue(S3_ORPHAN_PURGE_QUEUE_NAME, {
    connection: config.connection,
    defaultJobOptions: { removeOnComplete: 50, removeOnFail: 100 },
  });

  const registered = await registerScheduler(queue, cron);
  if (!registered) {
    // no-op — scheduler never registered, queue already closed in registerScheduler
    return { stop: () => Promise.resolve() };
  }

  const worker = spawnPurgeWorker(dataSource, config);

  return {
    stop: async () => {
      await safeClose('s3_orphan_purge_scheduler_remove_failed', () =>
        queue.removeJobScheduler(S3_ORPHAN_PURGE_SCHEDULER_ID),
      );
      await safeClose('s3_orphan_purge_worker_close_failed', () => worker.close());
      await safeClose('s3_orphan_purge_queue_close_failed', () => queue.close());
      logger.info('s3_orphan_purge_scheduler_stopped');
    },
  };
}
