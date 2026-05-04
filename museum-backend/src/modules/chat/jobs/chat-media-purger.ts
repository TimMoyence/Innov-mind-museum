import { unlink } from 'node:fs/promises';

import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import { parseS3AudioRef } from '../adapters/secondary/storage/audio-storage.s3';
import { resolveLocalAudioFilePath } from '../adapters/secondary/storage/audio-storage.stub';
import { parseS3ImageRef } from '../adapters/secondary/storage/image-storage.s3';
import { resolveLocalImageFilePath } from '../adapters/secondary/storage/image-storage.stub';
import { deleteObjectsBatch } from '../adapters/secondary/storage/s3-operations';

import type { S3ImageStorageConfig } from '../adapters/secondary/storage/s3-operations';

/** Per-batch outcome reported by {@link ChatMediaPurger.deleteRefs}. */
export interface ChatMediaPurgeResult {
  /** S3 object keys (or local file paths) successfully removed. */
  deleted: string[];
  /** References that could not be deleted, paired with the failure reason. */
  failed: { ref: string; reason: string }[];
  /** Refs the purger ignored on purpose (external URLs, malformed shape). */
  skipped: string[];
}

/**
 * Port for deleting media artefacts (images + TTS audio) referenced by chat
 * messages during retention purge. Implementations MUST be idempotent — a
 * missing object is treated as success, never as an error.
 */
export interface ChatMediaPurger {
  deleteRefs(refs: string[]): Promise<ChatMediaPurgeResult>;
}

/**
 * No-op purger used when no storage adapter is wired (e.g. tests). Returns
 * every input ref under `skipped` so call sites can still log a coherent
 * summary line.
 */
export const noopMediaPurger: ChatMediaPurger = {
  deleteRefs: (refs) => {
    return Promise.resolve({
      deleted: [],
      failed: [],
      skipped: [...refs],
    });
  },
};

/**
 * Splits refs into S3-keys / local-files / external-or-malformed, leveraging
 * the same parsers used by the storage adapters so behaviour stays in lock
 * step.
 *
 * External refs (Unsplash, raw HTTPS, Wikidata images) intentionally fall
 * through to `external` — those URLs are NOT under our control and must NOT
 * be deleted (would break unrelated services).
 */
interface ClassifiedRefs {
  s3Keys: string[];
  localPaths: { ref: string; path: string }[];
  external: string[];
}

/**
 * Buckets a list of message media references by storage backend.
 *
 * Recognised forms:
 *  - `s3://chat-images/...`            → S3 image
 *  - `s3://chat-audios/...`            → S3 audio (same bucket, different prefix)
 *  - `local://uuid.ext`                → local image file
 *  - `local-audio://uuid.ext`          → local TTS audio file
 *  - `https://images.unsplash.com/...` → external URL (NEVER deleted)
 *  - anything else                     → external (NEVER deleted)
 */
function classifyRefs(refs: string[]): ClassifiedRefs {
  const s3Keys: string[] = [];
  const localPaths: { ref: string; path: string }[] = [];
  const external: string[] = [];

  for (const ref of refs) {
    if (!ref || ref.length === 0) continue;

    const s3Image = parseS3ImageRef(ref);
    if (s3Image) {
      s3Keys.push(s3Image.key);
      continue;
    }
    const s3Audio = parseS3AudioRef(ref);
    if (s3Audio) {
      s3Keys.push(s3Audio.key);
      continue;
    }
    const localImage = resolveLocalImageFilePath(ref);
    if (localImage) {
      localPaths.push({ ref, path: localImage });
      continue;
    }
    const localAudio = resolveLocalAudioFilePath(ref);
    if (localAudio) {
      localPaths.push({ ref, path: localAudio });
      continue;
    }

    external.push(ref);
  }

  return { s3Keys, localPaths, external };
}

/** S3 DeleteObjects max batch size — hard-coded by the S3 spec. */
const S3_DELETE_BATCH_SIZE = 1000;

/**
 * Builds a media purger that fans out to either the configured S3 backend or
 * the local filesystem stub, matching the runtime storage driver.
 *
 * Why a single purger covers both image + audio: in production both adapters
 * point at the same bucket (image keys under `chat-images/`, audio under
 * `chat-audios/`). One DeleteObjects call per batch is the cheapest path and
 * `deleteObjectsBatch` already chunks correctly.
 */
export function buildChatMediaPurgerFromEnv(): ChatMediaPurger {
  if (env.storage.driver === 's3') {
    const s3 = env.storage.s3;
    if (!s3?.endpoint || !s3.region || !s3.bucket || !s3.accessKeyId || !s3.secretAccessKey) {
      logger.warn('chat_media_purger_s3_misconfigured', {
        message: 'OBJECT_STORAGE_DRIVER=s3 but S3 settings incomplete — falling back to noop',
      });
      return noopMediaPurger;
    }
    const config: S3ImageStorageConfig = {
      endpoint: s3.endpoint,
      region: s3.region,
      bucket: s3.bucket,
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
      signedUrlTtlSeconds: env.storage.signedUrlTtlSeconds,
      publicBaseUrl: s3.publicBaseUrl,
      sessionToken: s3.sessionToken,
      objectKeyPrefix: s3.objectKeyPrefix,
      requestTimeoutMs: env.requestTimeoutMs,
    };
    return new S3ChatMediaPurger(config);
  }
  return new LocalChatMediaPurger();
}

/**
 * S3 implementation. Batches DeleteObjects calls; a batch failure is captured
 * per-key in `failed` so the caller can keep going (one bad key never aborts
 * the whole tick).
 */
export class S3ChatMediaPurger implements ChatMediaPurger {
  constructor(
    private readonly config: S3ImageStorageConfig,
    /** Override hook for tests so we can stub the network call. */
    private readonly batchDeleter: (
      config: S3ImageStorageConfig,
      keys: string[],
    ) => Promise<void> = deleteObjectsBatch,
  ) {}

  /**
   * Deletes every recognised S3 ref in batches of 1000 (S3 spec limit). Local
   * refs that slip through (mixed-mode envs) are forwarded to the local
   * handler so cleanup still runs. External URLs land in `skipped`.
   *
   * @param refs Mix of `s3://`, `local://`, `local-audio://` and external URLs.
   */
  async deleteRefs(refs: string[]): Promise<ChatMediaPurgeResult> {
    const { s3Keys, localPaths, external } = classifyRefs(refs);
    // Local-driver refs slipped through (mixed-mode envs / leftover dev data).
    // Fall through to the local handler so they still get cleaned up.
    const failed: { ref: string; reason: string }[] = [];
    const deleted: string[] = [];

    for (let i = 0; i < s3Keys.length; i += S3_DELETE_BATCH_SIZE) {
      const batch = s3Keys.slice(i, i + S3_DELETE_BATCH_SIZE);
      try {
        await this.batchDeleter(this.config, batch);
        deleted.push(...batch);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        for (const key of batch) {
          failed.push({ ref: `s3://${key}`, reason });
        }
      }
    }

    if (localPaths.length > 0) {
      const localPurger = new LocalChatMediaPurger();
      const localResult = await localPurger.deleteRefs(localPaths.map((p) => p.ref));
      deleted.push(...localResult.deleted);
      failed.push(...localResult.failed);
    }

    return { deleted, failed, skipped: external };
  }
}

/**
 * Local-filesystem implementation. `ENOENT` is treated as success (idempotent
 * re-runs are a fact of life with cron jobs).
 */
export class LocalChatMediaPurger implements ChatMediaPurger {
  /**
   * Unlinks every recognised local file. `ENOENT` is treated as success.
   * `s3://` refs that reach this purger (mixed-mode safety net) land in
   * `skipped` — we won't delete what we can't authenticate against.
   *
   * @param refs Mix of `local://`, `local-audio://`, `s3://` and external URLs.
   */
  async deleteRefs(refs: string[]): Promise<ChatMediaPurgeResult> {
    const { localPaths, s3Keys, external } = classifyRefs(refs);
    const deleted: string[] = [];
    const failed: { ref: string; reason: string }[] = [];

    for (const { ref, path } of localPaths) {
      try {
        await unlink(path);
        deleted.push(ref);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          // already gone — treat as success
          deleted.push(ref);
          continue;
        }
        failed.push({
          ref,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Mixed-mode safety net: an `s3://` ref slipped into a local-driver env
    // (e.g. operator switched drivers mid-life). Cannot delete without an S3
    // client — bucket the refs as `skipped` so the operator notices.
    const skipped = [...external, ...s3Keys.map((k) => `s3://${k}`)];

    return { deleted, failed, skipped };
  }
}

/**
 * Re-export of the underlying classifier so the orphan-sweep job + tests can
 * reuse the same mapping logic without duplicating string-prefix parsing.
 */
export { classifyRefs };
