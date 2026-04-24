/**
 * One-shot ops migration: rewrites legacy S3 image keys from
 * `chat-images/YYYY/MM/<uuid>.ext` to the user-scoped GDPR-friendly
 * `chat-images/user-<userId>/YYYY/MM/<uuid>.ext`.
 *
 * Pipeline per row:
 *   1. Resolve owning userId via session join.
 *   2. Compute new key.
 *   3. S3 CopyObject old -> new (skip if already exists at target).
 *   4. UPDATE chat_messages.imageRef (same transaction as siblings in the batch).
 *   5. DeleteObject on the legacy key.
 *
 * Modes:
 *   - DRY-RUN by default (no --apply flag): plan + log, zero writes.
 *   - --apply: execute copy + DB update + legacy delete.
 *
 * Exit codes: 0 success | 1 fatal | 2 partial (some rows failed).
 */
import 'dotenv/config';
import 'reflect-metadata';

import { URL } from 'node:url';

import { AppDataSource } from '@data/db/data-source';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import {
  buildS3SignedHeaders,
  deleteObjectsBatch,
  type S3ImageStorageConfig,
} from '@modules/chat/adapters/secondary/s3-operations';
import {
  buildObjectPath,
  encodePathSegments,
  normalizeEndpoint,
} from '@modules/chat/adapters/secondary/s3-path-utils';
import { sha256Hex } from '@modules/chat/adapters/secondary/s3-signing';
import { env } from '@src/config/env';

import http from 'node:http';
import https from 'node:https';

// -----------------------------------------------------------------------------
// Types + CLI parsing
// -----------------------------------------------------------------------------

interface CliOptions {
  apply: boolean;
  limit: number;
  batchSize: number;
  verbose: boolean;
}

interface LegacyRow {
  id: string;
  sessionId: string;
  imageRef: string;
  userId: number | null;
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface JsonLog {
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = {
    apply: false,
    limit: Number.POSITIVE_INFINITY,
    batchSize: 100,
    verbose: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === '--apply') {
      opts.apply = true;
    } else if (arg === '--verbose') {
      opts.verbose = true;
    } else if (arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length));
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --limit value: ${arg}`);
      }
      opts.limit = Math.floor(n);
    } else if (arg.startsWith('--batch-size=')) {
      const n = Number(arg.slice('--batch-size='.length));
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --batch-size value: ${arg}`);
      }
      opts.batchSize = Math.floor(n);
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return opts;
};

const log = (entry: JsonLog): void => {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  if (entry.level === 'error' || entry.level === 'warn') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
};

// -----------------------------------------------------------------------------
// S3 config + low-level helpers (CopyObject + HeadObject)
// -----------------------------------------------------------------------------

const buildS3Config = (): S3ImageStorageConfig => {
  const s3 = env.storage.s3;
  if (!s3.endpoint || !s3.region || !s3.bucket || !s3.accessKeyId || !s3.secretAccessKey) {
    throw new Error(
      'S3 storage config incomplete: require S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY',
    );
  }
  return {
    endpoint: s3.endpoint,
    region: s3.region,
    bucket: s3.bucket,
    accessKeyId: s3.accessKeyId,
    secretAccessKey: s3.secretAccessKey,
    sessionToken: s3.sessionToken,
    publicBaseUrl: s3.publicBaseUrl,
    objectKeyPrefix: s3.objectKeyPrefix,
    signedUrlTtlSeconds: env.storage.signedUrlTtlSeconds,
  };
};

interface HttpResponse {
  statusCode: number;
  body: string;
}

const performHttp = async (params: {
  method: string;
  url: URL;
  headers: Record<string, string>;
  timeoutMs?: number;
}): Promise<HttpResponse> => {
  const client = params.url.protocol === 'https:' ? https : http;
  return await new Promise<HttpResponse>((resolve, reject) => {
    let settled = false;
    const finish = (err: Error | null, result?: HttpResponse): void => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(result ?? { statusCode: 0, body: '' });
    };
    const req = client.request(
      params.url,
      { method: params.method, headers: params.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        );
        res.on('end', () => {
          finish(null, {
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    if (params.timeoutMs && params.timeoutMs > 0) {
      req.setTimeout(params.timeoutMs, () => {
        req.destroy(new Error(`S3 request timed out after ${params.timeoutMs}ms`));
      });
    }
    req.on('error', (e) => finish(e));
    req.end();
  });
};

const buildKeyPath = (config: S3ImageStorageConfig, key: string): { url: URL; path: string } => {
  const endpoint = normalizeEndpoint(config.endpoint);
  const objectPath = buildObjectPath({
    bucket: config.bucket,
    key,
    endpointPath: endpoint.pathname,
  });
  const url = new URL(endpoint.toString());
  url.pathname = objectPath;
  url.search = '';
  return { url, path: objectPath };
};

/**
 * HEAD request. Returns true if object exists (2xx), false on 404, throws on other errors.
 */
const objectExists = async (config: S3ImageStorageConfig, key: string): Promise<boolean> => {
  const { url, path } = buildKeyPath(config, key);
  const endpoint = normalizeEndpoint(config.endpoint);
  const payloadHash = sha256Hex('');
  const signed = buildS3SignedHeaders({
    config,
    method: 'HEAD',
    path,
    queryString: '',
    headers: { host: endpoint.host },
    payloadHash,
  });
  const { statusCode, body } = await performHttp({
    method: 'HEAD',
    url,
    headers: { ...signed, Host: endpoint.host },
    timeoutMs: config.requestTimeoutMs,
  });
  if (statusCode === 404) return false;
  if (statusCode >= 200 && statusCode < 300) return true;
  throw new Error(`S3 HEAD failed (${statusCode}): ${body.slice(0, 500)}`);
};

/**
 * S3 CopyObject API. The copy-source header is bucket+key URL-encoded per SigV4 rules.
 */
const copyObject = async (
  config: S3ImageStorageConfig,
  srcKey: string,
  dstKey: string,
): Promise<void> => {
  const { url, path } = buildKeyPath(config, dstKey);
  const endpoint = normalizeEndpoint(config.endpoint);
  const bucketEnc = encodePathSegments(config.bucket);
  const keyEnc = encodePathSegments(srcKey);
  const copySource = `/${bucketEnc}/${keyEnc}`;
  const payloadHash = sha256Hex('');
  const signed = buildS3SignedHeaders({
    config,
    method: 'PUT',
    path,
    queryString: '',
    headers: {
      host: endpoint.host,
      'x-amz-copy-source': copySource,
    },
    payloadHash,
  });
  const { statusCode, body } = await performHttp({
    method: 'PUT',
    url,
    headers: {
      ...signed,
      Host: endpoint.host,
      'x-amz-copy-source': copySource,
    },
    timeoutMs: config.requestTimeoutMs,
  });
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`S3 CopyObject failed (${statusCode}): ${body.slice(0, 500)}`);
  }
  // CopyObject returns 200 even on internal failure — check body for <Error>.
  if (body.includes('<Error>')) {
    throw new Error(`S3 CopyObject error payload: ${body.slice(0, 500)}`);
  }
};

// -----------------------------------------------------------------------------
// Key rewrite logic
// -----------------------------------------------------------------------------

const LEGACY_KEY_REGEX = /^(chat-images)\/(\d{4})\/(\d{2})\/([^/]+)$/;

/**
 * Parses an `s3://` reference into its key.
 */
const extractKey = (imageRef: string): string | null => {
  const m = /^s3:\/\/(.+)$/.exec(imageRef);
  return m ? m[1] : null;
};

interface KeyRewrite {
  oldKey: string;
  newKey: string;
}

/**
 * Transforms a legacy key into a user-scoped one. Returns null when the key
 * is not in the legacy format or already user-scoped.
 */
const rewriteKey = (key: string, userId: number): KeyRewrite | null => {
  if (key.includes('/user-')) return null;
  const m = LEGACY_KEY_REGEX.exec(key);
  if (!m) return null;
  const [, prefix, year, month, file] = m;
  return {
    oldKey: key,
    newKey: `${prefix}/user-${String(userId)}/${year}/${month}/${file}`,
  };
};

// -----------------------------------------------------------------------------
// Main migration loop
// -----------------------------------------------------------------------------

interface RowOutcome {
  id: string;
  status: 'migrated' | 'skipped' | 'failed' | 'planned';
  reason?: string;
}

const processRow = async (params: {
  row: LegacyRow;
  config: S3ImageStorageConfig;
  apply: boolean;
  verbose: boolean;
  txManagerUpdate: (id: string, newRef: string) => Promise<void>;
}): Promise<RowOutcome> => {
  const { row, config, apply, verbose } = params;

  if (!row.imageRef.startsWith('s3://')) {
    return { id: row.id, status: 'skipped', reason: 'not-s3-ref' };
  }
  const oldKey = extractKey(row.imageRef);
  if (!oldKey) {
    return { id: row.id, status: 'skipped', reason: 'unparseable-ref' };
  }
  if (oldKey.includes('/user-')) {
    return { id: row.id, status: 'skipped', reason: 'already-migrated' };
  }
  if (row.userId === null) {
    log({ level: 'warn', msg: 'orphan session — no user owner', messageId: row.id });
    return { id: row.id, status: 'skipped', reason: 'orphan-session' };
  }
  const rewrite = rewriteKey(oldKey, row.userId);
  if (!rewrite) {
    return { id: row.id, status: 'skipped', reason: 'non-legacy-format' };
  }

  if (verbose) {
    log({
      level: 'debug',
      msg: 'row plan',
      messageId: row.id,
      oldKey: rewrite.oldKey,
      newKey: rewrite.newKey,
    });
  }

  if (!apply) {
    return { id: row.id, status: 'planned' };
  }

  // 1. Copy (skip if target already exists, e.g. partial prior run).
  const alreadyAtTarget = await objectExists(config, rewrite.newKey);
  if (!alreadyAtTarget) {
    await copyObject(config, rewrite.oldKey, rewrite.newKey);
  }

  // 2. DB update inside the caller's transaction.
  const newRef = `s3://${rewrite.newKey}`;
  await params.txManagerUpdate(row.id, newRef);

  // 3. Delete legacy key (best-effort: not fatal if it fails — target is authoritative).
  try {
    await deleteObjectsBatch(config, [rewrite.oldKey]);
  } catch (err) {
    log({
      level: 'warn',
      msg: 'legacy delete failed (non-fatal; rerun required)',
      messageId: row.id,
      key: rewrite.oldKey,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { id: row.id, status: 'migrated' };
};

const run = async (opts: CliOptions): Promise<number> => {
  log({
    level: 'info',
    msg: 'startup',
    apply: opts.apply,
    limit: Number.isFinite(opts.limit) ? opts.limit : null,
    batchSize: opts.batchSize,
  });

  const config = buildS3Config();

  await AppDataSource.initialize();
  try {
    // Count total to give a meaningful progress denominator.
    const repo = AppDataSource.getRepository(ChatMessage);
    const baseQb = repo
      .createQueryBuilder('m')
      .where("m.imageRef LIKE 's3://%chat-images/%'")
      .andWhere("m.imageRef NOT LIKE '%user-%'");
    const totalLegacy = await baseQb.getCount();
    const totalToProcess = Math.min(totalLegacy, opts.limit);
    log({ level: 'info', msg: 'scan', totalLegacy, targetProcess: totalToProcess });

    let processed = 0;
    let errors = 0;
    let migrated = 0;
    let skipped = 0;
    let offset = 0;

    while (processed < totalToProcess) {
      const remaining = totalToProcess - processed;
      const take = Math.min(opts.batchSize, remaining);

      // Fetch the next page. We use offset-based pagination because we may mutate
      // imageRef for some rows but leave others skipped (orphan session etc.), so
      // simple "WHERE legacy" re-reads could either miss rows or spin forever.
      const rows = await AppDataSource.query<
        { id: string; sessionId: string; imageRef: string; userId: number | null }[]
      >(
        `SELECT m."id", m."sessionId", m."imageRef", s."userId"
         FROM "chat_messages" m
         LEFT JOIN "chat_sessions" s ON s."id" = m."sessionId"
         WHERE m."imageRef" LIKE 's3://%chat-images/%'
           AND m."imageRef" NOT LIKE '%user-%'
         ORDER BY m."id"
         OFFSET $1 LIMIT $2`,
        [offset, take],
      );

      if (rows.length === 0) break;

      // Run the batch inside a single DB transaction — all imageRef updates
      // commit together, matching the S3 state at transaction commit time.
      await AppDataSource.transaction(async (tx) => {
        const updateRef = async (id: string, newRef: string): Promise<void> => {
          await tx
            .createQueryBuilder()
            .update(ChatMessage)
            .set({ imageRef: newRef })
            .where('id = :id', { id })
            .execute();
        };

        for (const raw of rows) {
          const row: LegacyRow = {
            id: raw.id,
            sessionId: raw.sessionId,
            imageRef: raw.imageRef,
            userId: raw.userId,
          };
          try {
            const outcome = await processRow({
              row,
              config,
              apply: opts.apply,
              verbose: opts.verbose,
              txManagerUpdate: updateRef,
            });
            if (outcome.status === 'migrated' || outcome.status === 'planned') {
              migrated += 1;
            } else if (outcome.status === 'skipped') {
              skipped += 1;
            }
          } catch (err) {
            errors += 1;
            log({
              level: 'error',
              msg: 'row failed',
              messageId: row.id,
              error: err instanceof Error ? err.message : String(err),
            });
          } finally {
            processed += 1;
            if (processed % 100 === 0) {
              log({
                level: 'info',
                msg: 'progress',
                processed,
                total: totalToProcess,
                errors,
              });
            }
          }
        }
      });

      // When not applying, we didn't mutate rows, so advance offset by the page size.
      // When applying, the rows we processed either moved out of the scan window
      // (imageRef rewritten) or stayed (skipped). We still advance by the raw
      // page length to guarantee forward progress on skipped rows.
      offset += rows.length;
    }

    log({
      level: 'info',
      msg: 'complete',
      processed,
      migrated,
      skipped,
      errors,
      dryRun: !opts.apply,
    });

    if (errors > 0 && migrated > 0) return 2;
    if (errors > 0) return 1;
    return 0;
  } finally {
    await AppDataSource.destroy();
  }
};

// -----------------------------------------------------------------------------
// Entrypoint
// -----------------------------------------------------------------------------

const main = async (): Promise<void> => {
  let opts: CliOptions;
  try {
    opts = parseCli(process.argv);
  } catch (err) {
    log({
      level: 'error',
      msg: 'cli parse error',
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
    return;
  }

  try {
    const code = await run(opts);
    process.exit(code);
  } catch (err) {
    log({
      level: 'error',
      msg: 'fatal',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  }
};

void main();
