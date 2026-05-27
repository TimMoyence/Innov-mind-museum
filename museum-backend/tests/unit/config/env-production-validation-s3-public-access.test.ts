/**
 * COMP-02 — S3 Public Access Block production gate (RGPD Art.32).
 *
 * Object keys are enumerable (`chat-images/YYYY/MM/user-<id>/...`); a bucket
 * left world-readable exposes every user's photos + voice audio. There is no
 * aws-sdk / Terraform in the repo, so the bucket's Public Access Block cannot
 * be asserted automatically at boot. Instead this gate forces the operator to
 * consciously attest (S3_PUBLIC_ACCESS_BLOCK_VERIFIED=true) that they verified
 * the bucket is private before any prod deploy — fail-closed, no boot-time
 * network dependency. Same shape as the DeepSeek residency gate (COMP-04).
 *
 * Actually enforcing the block (Terraform aws_s3_bucket_public_access_block or
 * a GetPublicAccessBlock probe) needs cloud credentials — escalated.
 *
 * Drives `validateProductionEnv` directly, matching
 * env-production-validation-redis.test.ts.
 */

import { validateProductionEnv } from '@src/config/env.production-validation';
import type { AppEnv } from '@src/config/env.types';
import {
  VALID_CSRF_SECRET,
  VALID_EXPORT_PSEUDONYM_SALT,
  VALID_JWT_ACCESS_SECRET,
  VALID_JWT_REFRESH_SECRET,
  VALID_MEDIA_SIGNING_SECRET,
  VALID_MFA_ENCRYPTION_KEY,
  VALID_MFA_SESSION_TOKEN_SECRET,
} from '../../helpers/config/prod-env.fixtures';

const makeEnv = (storageOverrides: Partial<AppEnv['storage']> = {}): AppEnv =>
  ({
    nodeEnv: 'production',
    brevoApiKey: 'brevo',
    llm: { provider: 'openai', openAiApiKey: 'sk-openai' },
    storage: {
      driver: 's3',
      localUploadsDir: '/app/tmp/uploads',
      signedUrlTtlSeconds: 900,
      signingSecret: VALID_MEDIA_SIGNING_SECRET,
      s3: {
        endpoint: 'https://s3.eu-west-3.amazonaws.com',
        region: 'eu-west-3',
        bucket: 'musaium-prod-eu-west-3',
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'secret_test',
      },
      ...storageOverrides,
    },
    exportPseudonymSalt: VALID_EXPORT_PSEUDONYM_SALT,
    auth: {
      accessTokenSecret: VALID_JWT_ACCESS_SECRET,
      refreshTokenSecret: VALID_JWT_REFRESH_SECRET,
      mfaEncryptionKey: VALID_MFA_ENCRYPTION_KEY,
      mfaSessionTokenSecret: VALID_MFA_SESSION_TOKEN_SECRET,
      csrfSecret: VALID_CSRF_SECRET,
      passwordBreachCheckEnabled: true,
    },
  }) as unknown as AppEnv;

describe('validateProductionEnv — S3 Public Access Block gate (COMP-02)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PGDATABASE: 'museum_prod',
      CORS_ORIGINS: 'https://app.musaium.com',
      MEDIA_SIGNING_SECRET: VALID_MEDIA_SIGNING_SECRET,
      JWT_ACCESS_SECRET: VALID_JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: VALID_JWT_REFRESH_SECRET,
      MFA_ENCRYPTION_KEY: VALID_MFA_ENCRYPTION_KEY,
      MFA_SESSION_TOKEN_SECRET: VALID_MFA_SESSION_TOKEN_SECRET,
      CSRF_SECRET: VALID_CSRF_SECRET,
      EXPORT_PSEUDONYM_SALT: VALID_EXPORT_PSEUDONYM_SALT,
      OPENAI_API_KEY: 'sk-openai',
      S3_ENDPOINT: 'https://s3.eu-west-3.amazonaws.com',
      S3_REGION: 'eu-west-3',
      S3_BUCKET: 'musaium-prod-eu-west-3',
      S3_ACCESS_KEY_ID: 'AKIA_TEST',
      S3_SECRET_ACCESS_KEY: 'secret_test',
    };
    delete process.env.JWT_SECRET;
    delete process.env.S3_PUBLIC_ACCESS_BLOCK_VERIFIED;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when S3 driver is used in prod without S3_PUBLIC_ACCESS_BLOCK_VERIFIED', () => {
    expect(() => validateProductionEnv(makeEnv())).toThrow(
      /S3_PUBLIC_ACCESS_BLOCK_VERIFIED|Public Access Block/i,
    );
  });

  it('throws when S3_PUBLIC_ACCESS_BLOCK_VERIFIED is falsy ("false")', () => {
    process.env.S3_PUBLIC_ACCESS_BLOCK_VERIFIED = 'false';
    expect(() => validateProductionEnv(makeEnv())).toThrow(/Public Access Block/i);
  });

  it('passes when the operator has attested the Public Access Block (verified=true)', () => {
    process.env.S3_PUBLIC_ACCESS_BLOCK_VERIFIED = 'true';
    expect(() => validateProductionEnv(makeEnv())).not.toThrow();
  });

  it('still requires S3_BUCKET even when the access block is attested', () => {
    process.env.S3_PUBLIC_ACCESS_BLOCK_VERIFIED = 'true';
    delete process.env.S3_BUCKET;
    expect(() =>
      validateProductionEnv(
        makeEnv({ s3: { endpoint: 'x', region: 'r', accessKeyId: 'a', secretAccessKey: 's' } }),
      ),
    ).toThrow(/S3_BUCKET/);
  });

  it('does NOT require the attestation when the local driver is used (no S3)', () => {
    expect(() => validateProductionEnv(makeEnv({ driver: 'local', s3: {} }))).not.toThrow();
  });
});
