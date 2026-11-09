import { listObjectsByPrefix } from '@modules/chat/adapters/secondary/storage/s3-operations';
import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import type { S3ImageStorageConfig } from '@modules/chat/adapters/secondary/storage/s3-operations';
import type { DataSource } from 'typeorm';

export const DEFAULT_CHAT_KEY_PREFIXES = ['chat-images/', 'chat-audios/'] as const;

export interface S3OrphanPurgeResult {
  scanned: number;
  deleted: number;
  referenced: number;
  tooFresh: number;
  failed: number;
}

export interface RunS3OrphanPurgeOptions {
  s3Config: S3ImageStorageConfig;
  retentionDays: number;
  prefixes?: readonly string[];
  pageLister?: (
    config: S3ImageStorageConfig,
    prefix: string,
    continuationToken?: string,
  ) => Promise<{
    objects: { key: string; lastModifiedMs: number }[];
    nextToken: string | undefined;
  }>;
  batchDeleter?: (config: S3ImageStorageConfig, keys: string[]) => Promise<void>;
}

const defaultPageLister: NonNullable<RunS3OrphanPurgeOptions['pageLister']> = async (
  config,
  prefix,
  continuationToken,
) => {
  const { objects, nextToken } = await listObjectsByPrefix(config, prefix, continuationToken);
  return { objects, nextToken };
};

const S3_DELETE_BATCH_SIZE = 1000;

async function findReferencedKeys(dataSource: DataSource, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();

  const refs = keys.map((k) => `s3://${k}`);
  const rows = await dataSource
    .getRepository(ChatMessage)
    .createQueryBuilder('msg')
    .select(['msg.imageRef AS "imageRef"', 'msg.audioUrl AS "audioUrl"'])
    .where('msg.imageRef IN (:...refs)', { refs })
    .orWhere('msg.audioUrl IN (:...refs)', { refs })
    .getRawMany<{ imageRef: string | null; audioUrl: string | null }>();

  const referenced = new Set<string>();
  for (const row of rows) {
    if (row.imageRef?.startsWith('s3://')) referenced.add(row.imageRef.slice('s3://'.length));
    if (row.audioUrl?.startsWith('s3://')) referenced.add(row.audioUrl.slice('s3://'.length));
  }
  return referenced;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function deleteOrphanBatch(
  config: S3ImageStorageConfig,
  batch: string[],
  prefix: string,
  batchDeleter: (config: S3ImageStorageConfig, keys: string[]) => Promise<void>,
  result: S3OrphanPurgeResult,
): Promise<void> {
  try {
    await batchDeleter(config, batch);
    result.deleted += batch.length;
  } catch (err) {
    result.failed += batch.length;
    logger.warn('s3_orphan_sweep_batch_failed', {
      prefix,
      batchSize: batch.length,
      error: errorMessage(err),
    });
  }
}

interface OrphanPage {
  objects: { key: string; lastModifiedMs: number }[];
}

interface ProcessPageContext {
  dataSource: DataSource;
  s3Config: S3ImageStorageConfig;
  prefix: string;
  cutoffMs: number;
  batchDeleter: (config: S3ImageStorageConfig, keys: string[]) => Promise<void>;
  result: S3OrphanPurgeResult;
}

async function processOrphanPage(ctx: ProcessPageContext, page: OrphanPage): Promise<void> {
  ctx.result.scanned += page.objects.length;

  const ageEligible = page.objects.filter((o) => o.lastModifiedMs <= ctx.cutoffMs);
  ctx.result.tooFresh += page.objects.length - ageEligible.length;
  if (ageEligible.length === 0) return;

  const candidateKeys = ageEligible.map((o) => o.key);
  const referenced = await findReferencedKeys(ctx.dataSource, candidateKeys);
  const orphans = candidateKeys.filter((k) => !referenced.has(k));
  ctx.result.referenced += candidateKeys.length - orphans.length;

  for (const batch of chunk(orphans, S3_DELETE_BATCH_SIZE)) {
    await deleteOrphanBatch(ctx.s3Config, batch, ctx.prefix, ctx.batchDeleter, ctx.result);
  }
}

export async function runS3OrphanPurge(
  dataSource: DataSource,
  opts: RunS3OrphanPurgeOptions,
): Promise<S3OrphanPurgeResult> {
  const prefixes = opts.prefixes ?? DEFAULT_CHAT_KEY_PREFIXES;
  const pageLister = opts.pageLister ?? defaultPageLister;
  const batchDeleter =
    opts.batchDeleter ??
    (await import('@modules/chat/adapters/secondary/storage/s3-operations')).deleteObjectsBatch;

  const cutoffMs = Date.now() - opts.retentionDays * 24 * 60 * 60 * 1000;

  const result: S3OrphanPurgeResult = {
    scanned: 0,
    deleted: 0,
    referenced: 0,
    tooFresh: 0,
    failed: 0,
  };

  for (const prefix of prefixes) {
    const ctx: ProcessPageContext = {
      dataSource,
      s3Config: opts.s3Config,
      prefix,
      cutoffMs,
      batchDeleter,
      result,
    };
    let continuationToken: string | undefined;
    do {
      const page = await pageLister(opts.s3Config, prefix, continuationToken);
      await processOrphanPage(ctx, page);
      continuationToken = page.nextToken;
    } while (continuationToken);
  }

  logger.info('s3_orphan_sweep_completed', {
    retentionDays: opts.retentionDays,
    ...result,
  });

  return result;
}
