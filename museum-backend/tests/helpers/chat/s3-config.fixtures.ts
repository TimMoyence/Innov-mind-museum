/**
 * Shared fixture for S3 storage config — used by audio + image storage tests.
 *
 * Placed under tests/helpers/chat/ per Phase 7 factory location convention
 * (`tests/helpers/<module>/<entity>.fixtures.ts`). The cast is intentionally
 * not needed: the helper returns a fully-formed value matching the type.
 */

import type { S3ImageStorageConfig } from '@modules/chat/adapters/secondary/s3-operations';

const DEFAULT_S3_CONFIG: S3ImageStorageConfig = {
  endpoint: 'https://s3.example.com',
  region: 'us-east-1',
  bucket: 'musaium-test',
  accessKeyId: 'AKIA-TEST',
  secretAccessKey: 'SECRET-TEST',
  signedUrlTtlSeconds: 900,
  requestTimeoutMs: 5000,
};

/**
 * Builds an `S3ImageStorageConfig` with sensible test defaults; reused for
 * the audio storage adapter (alias `S3AudioStorageConfig`).
 * @param overrides - Partial overrides (endpoint, bucket, prefix, etc.).
 * @returns A complete S3 config for tests.
 */
export const makeS3Config = (
  overrides: Partial<S3ImageStorageConfig> = {},
): S3ImageStorageConfig => ({
  ...DEFAULT_S3_CONFIG,
  ...overrides,
});
