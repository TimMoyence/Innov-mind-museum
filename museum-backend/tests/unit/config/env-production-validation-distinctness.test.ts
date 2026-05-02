/**
 * Phase 8 — pin the distinctness + provider-key + S3-driver branches in
 * `validateProductionEnv` that no existing test exercised.
 *
 * Each `it` block targets a NAMED regression: the specific throw message that
 * fires when a pair of production secrets collides. A future refactor that
 * silently drops one of these checks would flip the matching test from
 * "throws specific message" to "passes" — which is the point of pinning.
 */

import { validateProductionEnv } from '@src/config/env.production-validation';
import {
  VALID_CSRF_SECRET,
  VALID_JWT_ACCESS_SECRET,
  VALID_JWT_REFRESH_SECRET,
  VALID_MEDIA_SIGNING_SECRET,
  VALID_MFA_ENCRYPTION_KEY,
  VALID_MFA_SESSION_TOKEN_SECRET,
  validProductionEnv,
} from 'tests/helpers/config/prod-env.fixtures';

import type { AppEnv } from '@src/config/env.types';

const makeEnv = (overrides: Partial<AppEnv['auth']> = {}): AppEnv =>
  ({
    nodeEnv: 'production',
    brevoApiKey: 'brevo',
    llm: { provider: 'openai', openAiApiKey: 'sk-test' },
    storage: { driver: 'local', s3: {} },
    cache: undefined,
    auth: {
      accessTokenSecret: VALID_JWT_ACCESS_SECRET,
      refreshTokenSecret: VALID_JWT_REFRESH_SECRET,
      mfaEncryptionKey: VALID_MFA_ENCRYPTION_KEY,
      mfaSessionTokenSecret: VALID_MFA_SESSION_TOKEN_SECRET,
      csrfSecret: VALID_CSRF_SECRET,
      ...overrides,
    },
  }) as unknown as AppEnv;

describe('validateProductionEnv — secret distinctness branches', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, ...validProductionEnv() } as NodeJS.ProcessEnv;
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('CSRF_SECRET = MFA_ENCRYPTION_KEY → throws specific distinctness error', () => {
    process.env.CSRF_SECRET = VALID_MFA_ENCRYPTION_KEY;
    const env = makeEnv({ csrfSecret: VALID_MFA_ENCRYPTION_KEY });

    expect(() => validateProductionEnv(env)).toThrow(
      /CSRF_SECRET must be distinct from MFA_ENCRYPTION_KEY/,
    );
  });

  it('CSRF_SECRET = MFA_SESSION_TOKEN_SECRET → throws specific distinctness error', () => {
    process.env.CSRF_SECRET = VALID_MFA_SESSION_TOKEN_SECRET;
    const env = makeEnv({ csrfSecret: VALID_MFA_SESSION_TOKEN_SECRET });

    expect(() => validateProductionEnv(env)).toThrow(
      /CSRF_SECRET must be distinct from MFA_SESSION_TOKEN_SECRET/,
    );
  });

  it('MFA_ENCRYPTION_KEY = JWT_ACCESS_SECRET → throws specific distinctness error', () => {
    process.env.MFA_ENCRYPTION_KEY = VALID_JWT_ACCESS_SECRET;
    const env = makeEnv({ mfaEncryptionKey: VALID_JWT_ACCESS_SECRET });

    expect(() => validateProductionEnv(env)).toThrow(
      /MFA_ENCRYPTION_KEY must be distinct from JWT_ACCESS_SECRET/,
    );
  });

  it('MFA_ENCRYPTION_KEY = JWT_REFRESH_SECRET → throws specific distinctness error', () => {
    process.env.MFA_ENCRYPTION_KEY = VALID_JWT_REFRESH_SECRET;
    const env = makeEnv({ mfaEncryptionKey: VALID_JWT_REFRESH_SECRET });

    expect(() => validateProductionEnv(env)).toThrow(
      /MFA_ENCRYPTION_KEY must be distinct from JWT_REFRESH_SECRET/,
    );
  });

  it('MFA_ENCRYPTION_KEY = MEDIA_SIGNING_SECRET → throws specific distinctness error', () => {
    process.env.MFA_ENCRYPTION_KEY = VALID_MEDIA_SIGNING_SECRET;
    const env = makeEnv({ mfaEncryptionKey: VALID_MEDIA_SIGNING_SECRET });

    expect(() => validateProductionEnv(env)).toThrow(
      /MFA_ENCRYPTION_KEY must be distinct from MEDIA_SIGNING_SECRET/,
    );
  });

  it('MFA_SESSION_TOKEN_SECRET = JWT_ACCESS_SECRET → throws specific distinctness error', () => {
    process.env.MFA_SESSION_TOKEN_SECRET = VALID_JWT_ACCESS_SECRET;
    const env = makeEnv({ mfaSessionTokenSecret: VALID_JWT_ACCESS_SECRET });

    expect(() => validateProductionEnv(env)).toThrow(
      /MFA_SESSION_TOKEN_SECRET must be distinct from JWT_ACCESS_SECRET/,
    );
  });

  it('MFA_SESSION_TOKEN_SECRET = JWT_REFRESH_SECRET → throws specific distinctness error', () => {
    process.env.MFA_SESSION_TOKEN_SECRET = VALID_JWT_REFRESH_SECRET;
    const env = makeEnv({ mfaSessionTokenSecret: VALID_JWT_REFRESH_SECRET });

    expect(() => validateProductionEnv(env)).toThrow(
      /MFA_SESSION_TOKEN_SECRET must be distinct from JWT_REFRESH_SECRET/,
    );
  });

  it('MFA_SESSION_TOKEN_SECRET = MFA_ENCRYPTION_KEY → throws threat-model error', () => {
    process.env.MFA_SESSION_TOKEN_SECRET = VALID_MFA_ENCRYPTION_KEY;
    const env = makeEnv({ mfaSessionTokenSecret: VALID_MFA_ENCRYPTION_KEY });

    expect(() => validateProductionEnv(env)).toThrow(
      /MFA_SESSION_TOKEN_SECRET must be distinct from MFA_ENCRYPTION_KEY/,
    );
  });

  it('env.auth.mfaEncryptionKey out of sync with MFA_ENCRYPTION_KEY → throws drift error', () => {
    // process.env keeps the canonical key; env object holds a stale value to
    // simulate an env.ts wiring drift introduced by a future refactor.
    const env = makeEnv({ mfaEncryptionKey: 'z'.repeat(48) });

    expect(() => validateProductionEnv(env)).toThrow(
      /env\.auth\.mfaEncryptionKey is out of sync with MFA_ENCRYPTION_KEY/,
    );
  });
});

describe('validateProductionEnv — provider key branches', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, ...validProductionEnv() } as NodeJS.ProcessEnv;
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('llm.provider=deepseek without DEEPSEEK_API_KEY → throws missing required', () => {
    const env = {
      ...makeEnv(),
      llm: { provider: 'deepseek', deepseekApiKey: '' },
    } as unknown as AppEnv;

    expect(() => validateProductionEnv(env)).toThrow(/DEEPSEEK_API_KEY/);
  });

  it('llm.provider=google without GOOGLE_API_KEY → throws missing required', () => {
    const env = {
      ...makeEnv(),
      llm: { provider: 'google', googleApiKey: '' },
    } as unknown as AppEnv;

    expect(() => validateProductionEnv(env)).toThrow(/GOOGLE_API_KEY/);
  });

  it('storage.driver=s3 without S3 credentials → throws missing required', () => {
    const env = {
      ...makeEnv(),
      storage: { driver: 's3', s3: {} },
    } as unknown as AppEnv;

    expect(() => validateProductionEnv(env)).toThrow(/S3_ENDPOINT|S3_REGION|S3_BUCKET/);
  });
});
