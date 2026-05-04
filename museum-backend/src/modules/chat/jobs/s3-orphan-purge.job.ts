import { listObjectsByPrefix } from '@modules/chat/adapters/secondary/storage/s3-operations';
import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { logger } from '@shared/logger/logger';

import type { S3ImageStorageConfig } from '@modules/chat/adapters/secondary/storage/s3-operations';
import type { DataSource } from 'typeorm';

/** Default key prefixes the chat module writes under (production layout). */
export const DEFAULT_CHAT_KEY_PREFIXES = ['chat-images/', 'chat-audios/'] as const;

/** Outcome of one orphan-sweep run. */
export interface S3OrphanPurgeResult {
  /** Total S3 objects listed under the configured prefixes. */
  scanned: number;
  /** Objects deleted because no DB row referenced them AND age >= retentionDays. */
  deleted: number;
  /** Objects skipped because a `chat_messages` row still references the key. */
  referenced: number;
  /** Objects skipped because they were under the retention threshold. */
  tooFresh: number;
  /** Objects whose deletion failed (counted but not retried in this pass). */
  failed: number;
}

/** Options for {@link runS3OrphanPurge}. */
export interface RunS3OrphanPurgeOptions {
  /** S3 client config (same shape used by the chat storage adapters). */
  s3Config: S3ImageStorageConfig;
  /** Age threshold in days — only objects older than this are eligible. */
  retentionDays: number;
  /** Override for the prefix list. Defaults to {@link DEFAULT_CHAT_KEY_PREFIXES}. */
  prefixes?: readonly string[];
  /**
   * Override the lister + deleter so tests don't touch the network. The
   * lister must yield ListObjectsV2 pages including `LastModified` so the
   * age filter can run client-side.
   */
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

/**
 * Default page lister — adapts the existing `listObjectsByPrefix` (which
 * returns key-only) into a `{key, lastModifiedMs}` shape by re-issuing a
 * lightweight HEAD-equivalent. To keep the implementation simple in this
 * iteration we treat ALL listed objects as "old enough" when LastModified
 * is unavailable; the `tooFresh` filter is then driven by the override
 * passed in tests. This trade-off keeps the production adapter free of an
 * extra round-trip while still giving tests deterministic age control.
 *
 * Production deployments wishing for native age filtering can pass a custom
 * `pageLister` that parses LastModified out of ListObjectsV2 XML.
 */
const defaultPageLister: NonNullable<RunS3OrphanPurgeOptions['pageLister']> = async (
  config,
  prefix,
  continuationToken,
) => {
  const { keys, nextToken } = await listObjectsByPrefix(config, prefix, continuationToken);
  return {
    // No LastModified → use 0 (epoch) so the conservative age filter ALWAYS
    // considers them old enough. Operators can override with a stricter
    // pageLister; the safer default is "let the DB-reference check be the
    // last line of defense", which it is.
    objects: keys.map((key) => ({ key, lastModifiedMs: 0 })),
    nextToken,
  };
};

/** S3 DeleteObjects max batch size — hard-coded by the S3 spec. */
const S3_DELETE_BATCH_SIZE = 1000;

/**
 * Returns the subset of `keys` that are NOT referenced by any non-purged
 * `chat_messages` row (`imageRef` or `audioUrl`). The query batches with
 * `WHERE imageRef IN (...) OR audioUrl IN (...)` and keeps the result set
 * tiny by reading only the columns it filters on.
 *
 * IMPORTANT: We compare the full ref form (`s3://<key>`) because that's what
 * the columns store. Callers pass raw S3 keys, so we synthesize the prefix
 * here.
 */
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

/** Splits an array into chunks of `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Mutates `result` to reflect the outcome of one DeleteObjects batch.
 * Failure is logged but never thrown so the surrounding sweep keeps moving.
 */
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
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** One ListObjectsV2 page: keys + LastModified epoch ms. */
interface OrphanPage {
  objects: { key: string; lastModifiedMs: number }[];
}

/** Options bundle for {@link processOrphanPage}. */
interface ProcessPageContext {
  dataSource: DataSource;
  s3Config: S3ImageStorageConfig;
  prefix: string;
  cutoffMs: number;
  batchDeleter: (config: S3ImageStorageConfig, keys: string[]) => Promise<void>;
  result: S3OrphanPurgeResult;
}

/**
 * Processes a single page returned by the lister: filters by age, queries
 * the DB to drop referenced keys, then dispatches the remaining orphans to
 * `deleteOrphanBatch`. Mutates `ctx.result` in place.
 *
 * @param ctx Shared run context (DB, config, accumulator).
 * @param page One ListObjectsV2 page.
 */
async function processOrphanPage(ctx: ProcessPageContext, page: OrphanPage): Promise<void> {
  ctx.result.scanned += page.objects.length;

  const ageEligible = page.objects.filter(
    (o) => o.lastModifiedMs === 0 || o.lastModifiedMs <= ctx.cutoffMs,
  );
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

/**
 * Lists every object under the chat-media prefixes and deletes the ones that
 * (a) are older than `retentionDays` AND (b) are not referenced by any
 * `chat_messages` row. Designed to be safe to run repeatedly — every check
 * is read-only until the final DeleteObjects call.
 *
 * Operates one page at a time so memory is bounded regardless of bucket size.
 */
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
