/**
 * COMP-04 — DeepSeek data-residency production guard (RGPD Art.44-49 / Schrems II).
 *
 * DeepSeek (api.deepseek.com, China) has no EU adequacy decision. Selecting it
 * in production must fail fast unless the controller has consciously accepted
 * the cross-border transfer risk via DEEPSEEK_EU_TRANSFER_APPROVED. The default
 * provider (openai) and google must be unaffected — that negative case proves
 * the guard does not brick boot for the normal config.
 *
 * Drives `validateProductionEnv` directly with a synthesized AppEnv object,
 * matching env-production-validation-redis.test.ts.
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

const makeEnv = (llmOverrides: Partial<AppEnv['llm']> = {}): AppEnv =>
  ({
    nodeEnv: 'production',
    brevoApiKey: 'brevo',
    llm: { provider: 'deepseek', deepseekApiKey: 'sk-deepseek', ...llmOverrides },
    storage: { driver: 'local', s3: {} },
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

describe('validateProductionEnv — DeepSeek data-residency guard (COMP-04)', () => {
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
      DEEPSEEK_API_KEY: 'sk-deepseek',
      OPENAI_API_KEY: 'sk-openai',
      GOOGLE_API_KEY: 'g-key',
    };
    delete process.env.JWT_SECRET;
    delete process.env.DEEPSEEK_EU_TRANSFER_APPROVED;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when LLM_PROVIDER=deepseek in production without explicit EU-transfer approval', () => {
    expect(() => validateProductionEnv(makeEnv())).toThrow(
      /deepseek.*blocked in production|Schrems II/i,
    );
  });

  it('throws when DEEPSEEK_EU_TRANSFER_APPROVED is falsy ("false")', () => {
    process.env.DEEPSEEK_EU_TRANSFER_APPROVED = 'false';
    expect(() => validateProductionEnv(makeEnv())).toThrow(/Schrems II|blocked in production/i);
  });

  it('allows deepseek in production when EU transfer is explicitly approved (key present)', () => {
    process.env.DEEPSEEK_EU_TRANSFER_APPROVED = 'true';
    expect(() => validateProductionEnv(makeEnv())).not.toThrow();
  });

  it('still requires DEEPSEEK_API_KEY even when transfer is approved', () => {
    process.env.DEEPSEEK_EU_TRANSFER_APPROVED = 'true';
    delete process.env.DEEPSEEK_API_KEY;
    expect(() => validateProductionEnv(makeEnv({ deepseekApiKey: undefined }))).toThrow(
      /Missing required environment variable: DEEPSEEK_API_KEY/,
    );
  });

  it('does NOT throw for the default openai provider (no false-positive boot break)', () => {
    expect(() =>
      validateProductionEnv(makeEnv({ provider: 'openai', openAiApiKey: 'sk-openai' })),
    ).not.toThrow();
  });

  it('does NOT throw for the google provider', () => {
    expect(() =>
      validateProductionEnv(makeEnv({ provider: 'google', googleApiKey: 'g-key' })),
    ).not.toThrow();
  });
});
