import { randomUUID } from 'node:crypto';

import { extensionByMime } from '@shared/media/mime-extensions';
import { startSpan } from '@shared/observability/sentry';

import {
  buildS3SignedHeadersForPut,
  buildS3PresignedReadUrl,
  httpPut,
  listObjectsByPrefix,
  deleteObjectsBatch,
} from './s3-operations';
import { normalizeObjectKey } from './s3-path-utils';

import type { S3ImageStorageConfig } from './s3-operations';
import type {
  ImageStorage,
  LegacyImageKeyFetcher,
  SaveImageInput,
} from '@modules/chat/domain/ports/image-storage.port';

export const parseS3ImageRef = (imageRef: string): { key: string } | null => {
  const match = /^s3:\/\/(.+)$/.exec(imageRef);
  if (!match?.[1]) {
    return null;
  }

  return { key: match[1] };
};

export const isS3ImageRef = (imageRef: string | null | undefined): boolean => {
  return typeof imageRef === 'string' && imageRef.startsWith('s3://');
};

export const buildS3ImageRef = (key: string): string => {
  return `s3://${key}`;
};

export const buildS3SignedReadUrlFromRef = (params: {
  imageRef: string;
  config: S3ImageStorageConfig;
  ttlSeconds?: number;
  now?: Date;
}): { url: string; expiresAt: string } | null => {
  const parsed = parseS3ImageRef(params.imageRef);
  if (!parsed) {
    return null;
  }

  return buildS3PresignedReadUrl({
    key: parsed.key,
    config: params.config,
    ttlSeconds: params.ttlSeconds,
    now: params.now,
  });
};

export { buildS3PresignedReadUrl, listObjectsByPrefix, deleteObjectsBatch } from './s3-operations';

/** Uploads via signed PUT requests. */
export class S3CompatibleImageStorage implements ImageStorage {
  constructor(private readonly config: S3ImageStorageConfig) {}

  async save(input: SaveImageInput): Promise<string> {
    return await startSpan({ name: 'image.upload.s3', op: 'storage.upload' }, async () => {
      const body = Buffer.from(input.base64, 'base64');
      const extension = extensionByMime[input.mimeType] || 'img';
      const now = new Date();
      const userSegment =
        typeof input.userId === 'number' && Number.isFinite(input.userId)
          ? `user-${String(input.userId)}`
          : 'anonymous';
      const fallbackKey = [
        'chat-images',
        userSegment,
        String(now.getUTCFullYear()),
        String(now.getUTCMonth() + 1).padStart(2, '0'),
        `${randomUUID()}.${extension}`,
      ].join('/');
      const key = normalizeObjectKey({
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
        key: input.objectKey || fallbackKey,
        objectKeyPrefix: this.config.objectKeyPrefix,
      });

      const signed = buildS3SignedHeadersForPut({
        config: this.config,
        key,
        body,
        contentType: input.mimeType,
        now,
      });

      await httpPut({
        url: signed.url,
        headers: signed.headers,
        body,
        timeoutMs: this.config.requestTimeoutMs,
      });

      return buildS3ImageRef(key);
    });
  }

  /**
   * GDPR right-to-erasure, SEC-23 (B4). The PRODUCTION image key layout is
   * `chat-images/YYYY/MM/user-<id>/session-<sid>/<uuid>.<ext>` (built by
   * `buildChatImageObjectKey`, always passed as `objectKey`), so the user
   * segment is NOT at the head of the key — a `chat-images/user-<id>/` prefix
   * scan would match ZERO production objects. We therefore (1) list the whole
   * `chat-images/` prefix and delete only the keys whose path contains the
   * boundary-safe segment `/user-<id>/` (leading + trailing slash so `user-42`
   * never matches `user-420`); (2) delete `legacyFetcher` keys (DB-sourced) that
   * cover any remaining records. Batches DeleteObjects at 1000 keys (S3 limit).
   */
  async deleteByPrefix(
    userId: number | string,
    legacyFetcher?: LegacyImageKeyFetcher,
  ): Promise<void> {
    const normalizedUserId = typeof userId === 'number' ? userId : Number(userId);
    const userSegment = `user-${String(userId)}`;
    // SEC: boundary-safe match — leading + trailing slash so `user-42` does not
    // match `user-420/...`. Production keys embed the segment mid-path.
    const userPathSegment = `/${userSegment}/`;

    // Scan the whole `chat-images/` prefix (objectKeyPrefix-aware) — the user
    // segment is mid-key in the production layout, so a user-scoped prefix would
    // miss every object. Filter to this user's keys before deleting.
    const scanPrefix =
      normalizeObjectKey({
        key: 'chat-images',
        objectKeyPrefix: this.config.objectKeyPrefix,
      }) + '/';
    let continuationToken: string | undefined;
    do {
      const { objects, nextToken } = await listObjectsByPrefix(
        this.config,
        scanPrefix,
        continuationToken,
      );
      const userKeys = objects.map((o) => o.key).filter((key) => key.includes(userPathSegment));
      if (userKeys.length > 0) {
        await deleteObjectsBatch(this.config, userKeys);
      }
      continuationToken = nextToken;
    } while (continuationToken);

    if (legacyFetcher && Number.isFinite(normalizedUserId)) {
      const legacyRefs = await legacyFetcher(normalizedUserId);
      const legacyKeys = legacyRefs
        .map((ref) => parseS3ImageRef(ref)?.key)
        .filter((k): k is string => typeof k === 'string' && k.length > 0);
      // Dedup + filter anything already handled by the native scan.
      const uniqueLegacy = Array.from(new Set(legacyKeys)).filter(
        (k) => !k.includes(`/${userSegment}/`),
      );
      for (let i = 0; i < uniqueLegacy.length; i += 1000) {
        const batch = uniqueLegacy.slice(i, i + 1000);
        if (batch.length > 0) {
          await deleteObjectsBatch(this.config, batch);
        }
      }
    }
  }
}
