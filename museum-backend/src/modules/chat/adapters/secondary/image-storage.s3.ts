import { randomUUID } from 'node:crypto';

import { extensionByMime } from '@shared/media/mime-extensions';
import { startSpan } from '@shared/observability/sentry';

import {
  buildS3SignedHeadersForPut,
  httpPut,
  listObjectsByPrefix,
  deleteObjectsBatch,
  canonicalQueryString,
} from './s3-operations';
import { normalizeObjectKey, buildReadBaseUrlAndPath } from './s3-path-utils';
import { toAmzDate, signString } from './s3-signing';

import type { ImageStorage, SaveImageInput } from '../../domain/ports/image-storage.port';

/** Configuration for an S3-compatible image storage backend. */
export interface S3ImageStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  signedUrlTtlSeconds: number;
  publicBaseUrl?: string;
  sessionToken?: string;
  objectKeyPrefix?: string;
  requestTimeoutMs?: number;
}

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

/**
 * Generates an AWS SigV4 pre-signed GET URL for an S3 object.
 *
 * @param params - Object key, S3 config, optional TTL and timestamp.
 * @param params.key - S3 object key.
 * @param params.config - S3 connection and bucket configuration.
 * @param params.ttlSeconds - Optional TTL in seconds for the signed URL.
 * @param params.now - Optional timestamp override for signature generation.
 * @returns The signed URL and its ISO-8601 expiry.
 */
export const buildS3PresignedReadUrl = (params: {
  key: string;
  config: S3ImageStorageConfig;
  ttlSeconds?: number;
  now?: Date;
}): { url: string; expiresAt: string } => {
  const { url, objectPath } = buildReadBaseUrlAndPath({
    endpoint: params.config.endpoint,
    publicBaseUrl: params.config.publicBaseUrl,
    bucket: params.config.bucket,
    key: params.key,
  });

  const now = params.now ?? new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const ttlSeconds = Math.max(
    30,
    Math.min(60 * 60 * 24 * 7, params.ttlSeconds ?? params.config.signedUrlTtlSeconds),
  );
  const query: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    [
      'X-Amz-Credential',
      `${params.config.accessKeyId}/${dateStamp}/${params.config.region}/s3/aws4_request`,
    ],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(ttlSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  if (params.config.sessionToken) {
    query.push(['X-Amz-Security-Token', params.config.sessionToken]);
  }

  const canonicalRequest = [
    'GET',
    objectPath,
    canonicalQueryString(query),
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const { signature } = signString({
    secretAccessKey: params.config.secretAccessKey,
    dateStamp,
    region: params.config.region,
    amzDate,
    canonicalRequest,
  });

  query.push(['X-Amz-Signature', signature]);
  url.search = canonicalQueryString(query);

  return {
    url: url.toString(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
  };
};

// Re-export batch operations for external consumers
export { listObjectsByPrefix, deleteObjectsBatch } from './s3-operations';

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
      const fallbackKey = [
        'chat-images',
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
   * Deletes all objects whose key contains the given user pattern (e.g. `user-42`).
   * Lists all objects under `chat-images/` and filters by pattern match.
   *
   * @param userPattern - Substring to match within object keys (e.g. `user-42`).
   */
  async deleteByPrefix(userPattern: string): Promise<void> {
    const prefix = normalizeObjectKey({
      key: 'chat-images/',
      objectKeyPrefix: this.config.objectKeyPrefix,
    });
    let continuationToken: string | undefined;
    do {
      const { keys, nextToken } = await listObjectsByPrefix(this.config, prefix, continuationToken);
      const matching = keys.filter(
        (k) => k.includes(`/${userPattern}/`) || k.includes(`/${userPattern}`),
      );
      if (matching.length > 0) {
        // DeleteObjects supports max 1000 keys per call — list already returns max 1000
        await deleteObjectsBatch(this.config, matching);
      }
      continuationToken = nextToken;
    } while (continuationToken);
  }
}
