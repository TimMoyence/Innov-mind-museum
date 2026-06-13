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
  VALID_EXPORT_PSEUDONYM_SALT,
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
    // I-SEC5 — drift detection requires AppEnv stub to mirror process.env value.
    exportPseudonymSalt: VALID_EXPORT_PSEUDONYM_SALT,
    auth: {
      accessTokenSecret: VALID_JWT_ACCESS_SECRET,
      refreshTokenSecret: VALID_JWT_REFRESH_SECRET,
      mfaEncryptionKey: VALID_MFA_ENCRYPTION_KEY,
      mfaSessionTokenSecret: VALID_MFA_SESSION_TOKEN_SECRET,
      csrfSecret: VALID_CSRF_SECRET,
      passwordBreachCheckEnabled: true,
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

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/CSRF_SECRET must be distinct from MFA_ENCRYPTION_KEY/);
  });

  it('CSRF_SECRET = MFA_SESSION_TOKEN_SECRET → throws specific distinctness error', () => {
    process.env.CSRF_SECRET = VALID_MFA_SESSION_TOKEN_SECRET;
    const env = makeEnv({ csrfSecret: VALID_MFA_SESSION_TOKEN_SECRET });

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/CSRF_SECRET must be distinct from MFA_SESSION_TOKEN_SECRET/);
  });

  it('MFA_ENCRYPTION_KEY = JWT_ACCESS_SECRET → throws specific distinctness error', () => {
    process.env.MFA_ENCRYPTION_KEY = VALID_JWT_ACCESS_SECRET;
    const env = makeEnv({ mfaEncryptionKey: VALID_JWT_ACCESS_SECRET });

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/MFA_ENCRYPTION_KEY must be distinct from JWT_ACCESS_SECRET/);
  });

  it('MFA_ENCRYPTION_KEY = JWT_REFRESH_SECRET → throws specific distinctness error', () => {
    process.env.MFA_ENCRYPTION_KEY = VALID_JWT_REFRESH_SECRET;
    const env = makeEnv({ mfaEncryptionKey: VALID_JWT_REFRESH_SECRET });

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/MFA_ENCRYPTION_KEY must be distinct from JWT_REFRESH_SECRET/);
  });

  it('MFA_ENCRYPTION_KEY = MEDIA_SIGNING_SECRET → throws specific distinctness error', () => {
    process.env.MFA_ENCRYPTION_KEY = VALID_MEDIA_SIGNING_SECRET;
    const env = makeEnv({ mfaEncryptionKey: VALID_MEDIA_SIGNING_SECRET });

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/MFA_ENCRYPTION_KEY must be distinct from MEDIA_SIGNING_SECRET/);
  });

  it('MFA_SESSION_TOKEN_SECRET = JWT_ACCESS_SECRET → throws specific distinctness error', () => {
    process.env.MFA_SESSION_TOKEN_SECRET = VALID_JWT_ACCESS_SECRET;
    const env = makeEnv({ mfaSessionTokenSecret: VALID_JWT_ACCESS_SECRET });

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/MFA_SESSION_TOKEN_SECRET must be distinct from JWT_ACCESS_SECRET/);
  });

  it('MFA_SESSION_TOKEN_SECRET = JWT_REFRESH_SECRET → throws specific distinctness error', () => {
    process.env.MFA_SESSION_TOKEN_SECRET = VALID_JWT_REFRESH_SECRET;
    const env = makeEnv({ mfaSessionTokenSecret: VALID_JWT_REFRESH_SECRET });

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/MFA_SESSION_TOKEN_SECRET must be distinct from JWT_REFRESH_SECRET/);
  });

  it('MFA_SESSION_TOKEN_SECRET = MFA_ENCRYPTION_KEY → throws threat-model error', () => {
    process.env.MFA_SESSION_TOKEN_SECRET = VALID_MFA_ENCRYPTION_KEY;
    const env = makeEnv({ mfaSessionTokenSecret: VALID_MFA_ENCRYPTION_KEY });

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/MFA_SESSION_TOKEN_SECRET must be distinct from MFA_ENCRYPTION_KEY/);
  });

  it('env.auth.mfaEncryptionKey out of sync with MFA_ENCRYPTION_KEY → throws drift error', () => {
    // process.env keeps the canonical key; env object holds a stale value to
    // simulate an env.ts wiring drift introduced by a future refactor.
    const env = makeEnv({ mfaEncryptionKey: 'z'.repeat(48) });

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/env\.auth\.mfaEncryptionKey is out of sync with MFA_ENCRYPTION_KEY/);
  });

  // ── GAP-1 (#9): MEDIA_SIGNING_SECRET MUST be length-gated like every other
  // signing secret. The validator runs required() + distinctness on it but NO
  // assertSecretLength — so a too-short MEDIA_SIGNING_SECRET in an otherwise-valid
  // prod env is wrongly accepted. A short value still differs from the JWT secrets
  // (so the distinctness branches don't fire) → it reaches the end of the
  // validator without a length check. This test FAILS today (no throw); it passes
  // once the validator gains `assertSecretLength('MEDIA_SIGNING_SECRET', ...)`.
  it('GAP-1: MEDIA_SIGNING_SECRET shorter than 32 chars → throws length error', () => {
    const short = 'a'.repeat(8);
    process.env.MEDIA_SIGNING_SECRET = short;

    expect(() => {
      validateProductionEnv(makeEnv());
    }).toThrow(/MEDIA_SIGNING_SECRET must be >= 32 chars in production .*current length: 8/);
  });
});

// ── GAP-2 (#9): EXPORT_PSEUDONYM_SALT has required + assertSecretLength + drift
// detection but ZERO distinctness checks vs the other production secrets. Reusing
// any signing secret as the export salt collapses two trust domains (a leak of
// the salt would also leak the signing key, and vice-versa). The drift check
// (`env.exportPseudonymSalt !== salt`) fires BEFORE any distinctness logic would,
// so each test sets BOTH the raw process.env value AND the stub's
// `exportPseudonymSalt` to the colliding secret — that satisfies required +
// length + drift, leaving the (currently absent) distinctness check as the only
// thing that could throw. These tests FAIL today (no throw); they pass once the
// validator rejects a salt equal to another production secret.
describe('validateProductionEnv — EXPORT_PSEUDONYM_SALT distinctness (GAP-2, #9)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, ...validProductionEnv() } as NodeJS.ProcessEnv;
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('GAP-2: EXPORT_PSEUDONYM_SALT = JWT_ACCESS_SECRET → throws distinctness error', () => {
    process.env.EXPORT_PSEUDONYM_SALT = VALID_JWT_ACCESS_SECRET;
    const env = makeEnv();
    env.exportPseudonymSalt = VALID_JWT_ACCESS_SECRET;

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/EXPORT_PSEUDONYM_SALT must be distinct from JWT_ACCESS_SECRET/);
  });

  it('GAP-2: EXPORT_PSEUDONYM_SALT = MEDIA_SIGNING_SECRET → throws distinctness error', () => {
    process.env.EXPORT_PSEUDONYM_SALT = VALID_MEDIA_SIGNING_SECRET;
    const env = makeEnv();
    env.exportPseudonymSalt = VALID_MEDIA_SIGNING_SECRET;

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/EXPORT_PSEUDONYM_SALT must be distinct from MEDIA_SIGNING_SECRET/);
  });

  it('GAP-2: EXPORT_PSEUDONYM_SALT = CSRF_SECRET → throws distinctness error', () => {
    process.env.EXPORT_PSEUDONYM_SALT = VALID_CSRF_SECRET;
    const env = makeEnv();
    env.exportPseudonymSalt = VALID_CSRF_SECRET;

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/EXPORT_PSEUDONYM_SALT must be distinct from CSRF_SECRET/);
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
    // COMP-04: the Schrems II residency guard now runs before the key check, so
    // approve the EU transfer to reach (and assert) the missing-key branch.
    process.env.DEEPSEEK_EU_TRANSFER_APPROVED = 'true';
    const env = {
      ...makeEnv(),
      llm: { provider: 'deepseek', deepseekApiKey: '' },
    } as unknown as AppEnv;

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/DEEPSEEK_API_KEY/);
  });

  it('llm.provider=google without GOOGLE_API_KEY → throws missing required', () => {
    const env = {
      ...makeEnv(),
      llm: { provider: 'google', googleApiKey: '' },
    } as unknown as AppEnv;

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/GOOGLE_API_KEY/);
  });

  it('storage.driver=s3 without S3 credentials → throws missing required', () => {
    // COMP-02: the Public Access Block gate now runs before the credential
    // checks, so attest it to reach (and assert) the missing-credential branch.
    process.env.S3_PUBLIC_ACCESS_BLOCK_VERIFIED = 'true';
    const env = {
      ...makeEnv(),
      storage: { driver: 's3', s3: {} },
    } as unknown as AppEnv;

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/S3_ENDPOINT|S3_REGION|S3_BUCKET/);
  });
});
