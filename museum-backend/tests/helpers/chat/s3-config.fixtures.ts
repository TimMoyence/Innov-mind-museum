import type { S3ImageStorageConfig } from '@modules/chat/adapters/secondary/storage/s3-operations';

const DEFAULT_S3_CONFIG: S3ImageStorageConfig = {
  endpoint: 'https://s3.example.com',
  region: 'us-east-1',
  bucket: 'musaium-test',
  accessKeyId: 'AKIA-TEST',
  secretAccessKey: 'SECRET-TEST',
  signedUrlTtlSeconds: 900,
  requestTimeoutMs: 5000,
};

export const makeS3Config = (
  overrides: Partial<S3ImageStorageConfig> = {},
): S3ImageStorageConfig => ({
  ...DEFAULT_S3_CONFIG,
  ...overrides,
});
