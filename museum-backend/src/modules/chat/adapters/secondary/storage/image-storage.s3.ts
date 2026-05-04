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

/**
 * Extracts the S3 object key from an `s3://` image reference.
 *
 * @param imageRef - Storage reference string.
 * @returns An object containing the key, or `null` if the reference is not an S3 URI.
 */
export const parseS3ImageRef = (imageRef: string): { key: string } | null => {
  const match = /^s3:\/\/(.+)$/.exec(imageRef);
  if (!match?.[1]) {
    return null;
  }

  return { key: match[1] };
};

/**
 * Checks whether a storage reference is an S3 URI (`s3://...`).
 *
 * @param imageRef - Storage reference string (may be null/undefined).
 * @returns `true` if the reference starts with `s3://`.
 */
export const isS3ImageRef = (imageRef: string | null | undefined): boolean => {
  return typeof imageRef === 'string' && imageRef.startsWith('s3://');
};

/**
 * Builds an `s3://` storage reference from an object key.
 *
 * @param key - S3 object key.
 * @returns An `s3://<key>` URI.
 */
export const buildS3ImageRef = (key: string): string => {
  return `s3://${key}`;
};

/**
 * Generates a pre-signed GET URL from an `s3://` image reference.
 *
 * @param params - Image reference, S3 config, optional TTL and timestamp.
 * @param params.imageRef - S3 image reference string (e.g. `s3://key`).
 * @param params.config - S3 connection and bucket configuration.
 * @param params.ttlSeconds - Optional TTL in seconds for the signed URL.
 * @param params.now - Optional timestamp override for signature generation.
 * @returns Signed URL and expiry timestamp, or `null` if the reference is not a valid S3 URI.
 */
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

// Re-export shared S3 operations for external consumers
export { buildS3PresignedReadUrl, listObjectsByPrefix, deleteObjectsBatch } from './s3-operations';

/** S3-compatible implementation of {@link ImageStorage} — uploads images via signed PUT requests. */
export class S3CompatibleImageStorage implements ImageStorage {
  constructor(private readonly config: S3ImageStorageConfig) {}

  /**
   * Uploads a base64-encoded image to S3 and returns an `s3://` reference.
   *
   * @param input - Image data, MIME type, and optional object key.
   * @returns An `s3://<key>` storage reference.
   * @throws {Error} If the S3 PUT request fails.
   */
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
   * Removes every image tied to a user (GDPR right-to-erasure, SEC-23).
   *
   * Strategy:
   * 1. Native S3 prefix scan on `chat-images/user-<userId>/` — zero client-side
   *    filtering, O(N objects for this user) list calls.
   * 2. If `legacyFetcher` is provided, its returned keys (extracted from DB
   *    `chat_messages.imageRef` rows owned by the user) are deleted directly
   *    to cover records written before the user-scoped path format existed.
   *
   * Batches DeleteObjects calls at 1000 keys (S3 API limit).
   *
   * @param userId - Numeric (or stringified numeric) user ID.
   * @param legacyFetcher - Optional callback returning legacy keys to delete.
   */
  async deleteByPrefix(
    userId: number | string,
    legacyFetcher?: LegacyImageKeyFetcher,
  ): Promise<void> {
    const normalizedUserId = typeof userId === 'number' ? userId : Number(userId);
    const userSegment = `user-${String(userId)}`;

    // 1. Native prefix scan — new keys live under chat-images/user-<id>/
    // SEC: trailing slash required so `user-42` does not match `user-420/*` etc.
    // normalizeObjectKey strips trailing slashes; re-append after normalization.
    const userPrefix =
      normalizeObjectKey({
        key: `chat-images/${userSegment}`,
        objectKeyPrefix: this.config.objectKeyPrefix,
      }) + '/';
    let continuationToken: string | undefined;
    do {
      const { keys, nextToken } = await listObjectsByPrefix(
        this.config,
        userPrefix,
        continuationToken,
      );
      if (keys.length > 0) {
        await deleteObjectsBatch(this.config, keys);
      }
      continuationToken = nextToken;
    } while (continuationToken);

    // 2. Legacy keys — records written before the user-scoped format.
    if (legacyFetcher && Number.isFinite(normalizedUserId)) {
      const legacyRefs = await legacyFetcher(normalizedUserId);
      const legacyKeys = legacyRefs
        .map((ref) => parseS3ImageRef(ref)?.key)
        .filter((k): k is string => typeof k === 'string' && k.length > 0);
      // Deduplicate + filter out anything already handled by the native scan.
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
