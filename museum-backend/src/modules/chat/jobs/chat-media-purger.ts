import { unlink } from 'node:fs/promises';

import { parseS3AudioRef } from '@modules/chat/adapters/secondary/storage/audio-storage.s3';
import { resolveLocalAudioFilePath } from '@modules/chat/adapters/secondary/storage/audio-storage.stub';
import { parseS3ImageRef } from '@modules/chat/adapters/secondary/storage/image-storage.s3';
import { resolveLocalImageFilePath } from '@modules/chat/adapters/secondary/storage/image-storage.stub';
import { deleteObjectsBatch } from '@modules/chat/adapters/secondary/storage/s3-operations';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { S3ImageStorageConfig } from '@modules/chat/adapters/secondary/storage/s3-operations';

export interface ChatMediaPurgeResult {
  deleted: string[];
  failed: { ref: string; reason: string }[];
  skipped: string[];
}

export interface ChatMediaPurger {
  deleteRefs(refs: string[]): Promise<ChatMediaPurgeResult>;
}

export const noopMediaPurger: ChatMediaPurger = {
  deleteRefs: (refs) => {
    return Promise.resolve({
      deleted: [],
      failed: [],
      skipped: [...refs],
    });
  },
};

interface ClassifiedRefs {
  s3Keys: string[];
  localPaths: { ref: string; path: string }[];
  external: string[];
}

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

const S3_DELETE_BATCH_SIZE = 1000;

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

export class S3ChatMediaPurger implements ChatMediaPurger {
  constructor(
    private readonly config: S3ImageStorageConfig,
    private readonly batchDeleter: (
      config: S3ImageStorageConfig,
      keys: string[],
    ) => Promise<void> = deleteObjectsBatch,
  ) {}

  async deleteRefs(refs: string[]): Promise<ChatMediaPurgeResult> {
    const { s3Keys, localPaths, external } = classifyRefs(refs);
    const failed: { ref: string; reason: string }[] = [];
    const deleted: string[] = [];

    for (let i = 0; i < s3Keys.length; i += S3_DELETE_BATCH_SIZE) {
      const batch = s3Keys.slice(i, i + S3_DELETE_BATCH_SIZE);
      try {
        await this.batchDeleter(this.config, batch);
        deleted.push(...batch);
      } catch (err) {
        const reason = errorMessage(err);
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

export class LocalChatMediaPurger implements ChatMediaPurger {
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
          deleted.push(ref);
          continue;
        }
        failed.push({
          ref,
          reason: errorMessage(err),
        });
      }
    }

    const skipped = [...external, ...s3Keys.map((k) => `s3://${k}`)];

    return { deleted, failed, skipped };
  }
}

export { classifyRefs };
