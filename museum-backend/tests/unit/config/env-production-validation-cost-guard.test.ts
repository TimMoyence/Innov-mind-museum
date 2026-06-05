/**
 * W1-C2 RED — LLM cost-guard fail-CLOSED at boot in production.
 * Run: 2026-05-26-kr-domains · design.md §W1-C2 / AC-C2.1..C2.2.
 *
 * Problem pinned: in production, the per-user daily USD cap is enforced via the
 * Redis-backed `llmCostCounter`. If `OPENAI_USER_DAILY_USD_CAP > 0` (the default
 * is 0.5) but Redis is disabled (`REDIS_URL` unset → `env.cache` undefined), the
 * counter is never wired and `llmCostGuard` silently fails OPEN — paid LLM calls
 * run with NO per-user cap. `validateProductionEnv` must fail-CLOSED at boot
 * instead: throw a clear error naming `OPENAI_USER_DAILY_USD_CAP` and `REDIS_URL`.
 *
 * Mirrors `env-production-validation-redis.test.ts`: drives `validateProductionEnv`
 * directly with a synthesized AppEnv + a matching `process.env` so the existing
 * required(...) gates are satisfied and only the cost-guard/Redis branch decides.
 *
 * RED failure mode at be758ab56: `validateProductionEnv` has NO cost-guard ↔ Redis
 * cross-check, so the first case (cap > 0, cache disabled) does NOT throw → the
 * `toThrow(...)` assertion FAILS. Counts as RED (design.md §6 / AC-C2.1).
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP.
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

const STRONG_REDIS_PASSWORD = 'r'.repeat(48);

interface MakeEnvOptions {
  /** Per-authenticated-user daily USD ceiling. Default 0.5 (env.ts default). */
  userDailyCapUsd?: number;
  /** When false, simulates Redis disabled (REDIS_URL unset → env.cache undefined). */
  cacheEnabled?: boolean;
}

/**
 * Synthesizes a production AppEnv that passes every OTHER required(...) gate so the
 * cost-guard ↔ Redis cross-check is the only decision under test. When
 * `cacheEnabled` is false, `cache` is omitted entirely (mirrors `REDIS_URL` unset).
 * @param options
 */
const makeEnv = ({ userDailyCapUsd = 0.5, cacheEnabled = false }: MakeEnvOptions = {}): AppEnv =>
  ({
    nodeEnv: 'production',
    brevoApiKey: 'brevo',
    llm: {
      provider: 'openai',
      openAiApiKey: 'sk-test',
      costGuard: { killSwitch: false, userDailyCapUsd },
    },
    storage: { driver: 'local', s3: {} },
    exportPseudonymSalt: VALID_EXPORT_PSEUDONYM_SALT,
    ...(cacheEnabled
      ? {
          cache: {
            enabled: true,
            url: 'redis://redis:6379',
            password: STRONG_REDIS_PASSWORD,
          },
        }
      : {}),
    auth: {
      accessTokenSecret: VALID_JWT_ACCESS_SECRET,
      refreshTokenSecret: VALID_JWT_REFRESH_SECRET,
      mfaEncryptionKey: VALID_MFA_ENCRYPTION_KEY,
      mfaSessionTokenSecret: VALID_MFA_SESSION_TOKEN_SECRET,
      csrfSecret: VALID_CSRF_SECRET,
      passwordBreachCheckEnabled: true,
    },
  }) as unknown as AppEnv;

describe('validateProductionEnv — LLM cost-guard fail-CLOSED (W1-C2)', () => {
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
      OPENAI_API_KEY: 'sk-test',
    };
    // Simulate Redis NOT configured by default — REDIS_URL/REDIS_HOST unset.
    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PASSWORD;
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when cap > 0 and Redis cache is disabled (cannot enforce per-user cap)', () => {
    expect(() => {
      validateProductionEnv(makeEnv({ userDailyCapUsd: 0.5, cacheEnabled: false }));
    }).toThrow(/OPENAI_USER_DAILY_USD_CAP/);

    // Same throw must also name REDIS_URL so the operator knows the two ways out.
    expect(() => {
      validateProductionEnv(makeEnv({ userDailyCapUsd: 0.5, cacheEnabled: false }));
    }).toThrow(/REDIS_URL/);
  });

  it('does NOT throw when cap > 0 and Redis cache is enabled (counter can be wired)', () => {
    process.env.REDIS_URL = 'redis://redis:6379';
    process.env.REDIS_PASSWORD = STRONG_REDIS_PASSWORD;
    expect(() => {
      validateProductionEnv(makeEnv({ userDailyCapUsd: 0.5, cacheEnabled: true }));
    }).not.toThrow();
  });

  it('does NOT throw when cap === 0 even with Redis disabled (explicit operator opt-out)', () => {
    expect(() => {
      validateProductionEnv(makeEnv({ userDailyCapUsd: 0, cacheEnabled: false }));
    }).not.toThrow();
  });
});
