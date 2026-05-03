/**
 * P3.1 — Redis production hardening tests.
 *
 * Enforces:
 *   - REDIS_PASSWORD >= 32 chars in production (same floor as JWT secrets).
 *   - REDIS_PASSWORD distinct from JWT_ACCESS_SECRET / JWT_REFRESH_SECRET /
 *     MEDIA_SIGNING_SECRET (no cross-service secret reuse).
 *
 * Drives `validateProductionEnv` directly with a synthesized AppEnv object,
 * matching the pattern in env-production-validation-secret-length.test.ts.
 */

import { validateProductionEnv } from '@src/config/env.production-validation';
import type { AppEnv } from '@src/config/env.types';
import {
  VALID_CSRF_SECRET,
  VALID_JWT_ACCESS_SECRET,
  VALID_JWT_REFRESH_SECRET,
  VALID_MEDIA_SIGNING_SECRET,
  VALID_MFA_ENCRYPTION_KEY,
  VALID_MFA_SESSION_TOKEN_SECRET,
} from '../../helpers/config/prod-env.fixtures';

const STRONG_REDIS_PASSWORD = 'r'.repeat(48);

const makeEnvWithCache = (cacheOverrides: Partial<NonNullable<AppEnv['cache']>> = {}): AppEnv =>
  ({
    nodeEnv: 'production',
    brevoApiKey: 'brevo',
    llm: { provider: 'openai', openAiApiKey: 'sk-test' },
    storage: { driver: 'local', s3: {} },
    cache: {
      enabled: true,
      url: 'redis://redis:6379',
      password: STRONG_REDIS_PASSWORD,
      ...cacheOverrides,
    },
    auth: {
      accessTokenSecret: VALID_JWT_ACCESS_SECRET,
      refreshTokenSecret: VALID_JWT_REFRESH_SECRET,
      mfaEncryptionKey: VALID_MFA_ENCRYPTION_KEY,
      mfaSessionTokenSecret: VALID_MFA_SESSION_TOKEN_SECRET,
      csrfSecret: VALID_CSRF_SECRET,
      passwordBreachCheckEnabled: true,
    },
  }) as unknown as AppEnv;

describe('validateProductionEnv — Redis password hardening (P3.1)', () => {
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
      OPENAI_API_KEY: 'sk-test',
      REDIS_URL: 'redis://redis:6379',
      REDIS_PASSWORD: STRONG_REDIS_PASSWORD,
    };
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('passes when Redis is enabled with a 32+ char password distinct from every signing secret', () => {
    expect(() => {
      validateProductionEnv(makeEnvWithCache());
    }).not.toThrow();
  });

  it('skips Redis checks when cache is disabled', () => {
    expect(() => {
      validateProductionEnv(makeEnvWithCache({ enabled: false }));
    }).not.toThrow();
  });

  it('throws when REDIS_PASSWORD is shorter than 32 chars', () => {
    const weak = 'short-pw-12345';
    process.env.REDIS_PASSWORD = weak;
    expect(() => {
      validateProductionEnv(makeEnvWithCache({ password: weak }));
    }).toThrow(/REDIS_PASSWORD must be >= 32 chars in production .*current length: 14/);
  });

  it('throws when REDIS_PASSWORD equals JWT_ACCESS_SECRET', () => {
    process.env.REDIS_PASSWORD = VALID_JWT_ACCESS_SECRET;
    expect(() => {
      validateProductionEnv(makeEnvWithCache({ password: VALID_JWT_ACCESS_SECRET }));
    }).toThrow(/REDIS_PASSWORD must be distinct from JWT_ACCESS_SECRET/);
  });

  it('throws when REDIS_PASSWORD equals JWT_REFRESH_SECRET', () => {
    process.env.REDIS_PASSWORD = VALID_JWT_REFRESH_SECRET;
    expect(() => {
      validateProductionEnv(makeEnvWithCache({ password: VALID_JWT_REFRESH_SECRET }));
    }).toThrow(/REDIS_PASSWORD must be distinct from JWT_REFRESH_SECRET/);
  });

  it('throws when REDIS_PASSWORD equals MEDIA_SIGNING_SECRET', () => {
    process.env.REDIS_PASSWORD = VALID_MEDIA_SIGNING_SECRET;
    expect(() => {
      validateProductionEnv(makeEnvWithCache({ password: VALID_MEDIA_SIGNING_SECRET }));
    }).toThrow(/REDIS_PASSWORD must be distinct from MEDIA_SIGNING_SECRET/);
  });

  it('throws when REDIS_PASSWORD is missing entirely while cache is enabled', () => {
    delete process.env.REDIS_PASSWORD;
    expect(() => {
      validateProductionEnv(makeEnvWithCache({ password: undefined }));
    }).toThrow(/Missing required environment variable: REDIS_PASSWORD/);
  });
});
