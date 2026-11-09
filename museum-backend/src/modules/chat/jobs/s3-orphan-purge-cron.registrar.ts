import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import { registerDailyPurgeCron, type DailyPurgeCronHandle } from './daily-purge-cron';
import { runS3OrphanPurge } from './s3-orphan-purge.job';

import type { S3OrphanPurgeResult } from './s3-orphan-purge.job';
import type { S3ImageStorageConfig } from '../adapters/secondary/storage/s3-operations';
import type { ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

export const S3_ORPHAN_PURGE_QUEUE_NAME = 's3-orphan-purge-scheduler';

export const S3_ORPHAN_PURGE_SCHEDULER_ID = 's3-orphan-purge-daily';

export const DEFAULT_S3_ORPHAN_PURGE_CRON = '30 4 * * *';

export type S3OrphanPurgeRunner = (
  dataSource: DataSource,
  opts: { s3Config: S3ImageStorageConfig; retentionDays: number },
) => Promise<S3OrphanPurgeResult>;

export interface S3OrphanPurgeCronConfig {
  connection: ConnectionOptions;
  retentionDays?: number;
  cron?: string;
  s3Config?: S3ImageStorageConfig;
  runner?: S3OrphanPurgeRunner;
}

export type S3OrphanPurgeCronHandle = DailyPurgeCronHandle;

function isS3ConfigComplete(s3: typeof env.storage.s3): boolean {
  if (env.storage.driver !== 's3' || !s3) return false;
  const required = [s3.endpoint, s3.region, s3.bucket, s3.accessKeyId, s3.secretAccessKey];
  return required.every((field) => typeof field === 'string' && field.length > 0);
}

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

function createS3OrphanPurgeTick(
  dataSource: DataSource,
  config: S3OrphanPurgeCronConfig,
): () => Promise<unknown> {
  const runner = config.runner ?? runS3OrphanPurge;
  const resolved = config.s3Config
    ? { config: config.s3Config, complete: true }
    : resolveS3ConfigFromEnv();
  const retentionDays = config.retentionDays ?? env.s3OrphanPurgeRetentionDays;

  return async () => {
    if (!resolved.complete) {
      logger.warn('s3_orphan_purge_s3_misconfigured', {
        message: 'OBJECT_STORAGE_DRIVER=s3 settings incomplete — orphan sweep may no-op',
      });
    }
    await runner(dataSource, { s3Config: resolved.config, retentionDays });
  };
}

export function registerS3OrphanPurgeCron(
  dataSource: DataSource,
  config: S3OrphanPurgeCronConfig,
): Promise<S3OrphanPurgeCronHandle> {
  return registerDailyPurgeCron({
    queueName: S3_ORPHAN_PURGE_QUEUE_NAME,
    schedulerId: S3_ORPHAN_PURGE_SCHEDULER_ID,
    cron: config.cron ?? DEFAULT_S3_ORPHAN_PURGE_CRON,
    connection: config.connection,
    createTick: () => createS3OrphanPurgeTick(dataSource, config),
  });
}
