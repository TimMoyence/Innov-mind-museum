/**
 * RED — T1.1 — R1 — `validateProductionEnv` MUST fail-fast when
 * `EXPORT_PSEUDONYM_SALT` is unset or shorter than 32 chars in production.
 *
 * Spec : team-state/2026-05-21-p0-c3-auth-crypto/spec.md §R1.
 * Design : team-state/2026-05-21-p0-c3-auth-crypto/design.md §3.3.
 * Mirror : `validateCsrfSecret` shape (env.production-validation.ts:164-191) —
 * required env var + length-gate + drift detection vs `env.auth.exportPseudonymSalt`.
 *
 * Anchored to PATTERNS / LESSONS :
 *  - I-SEC5 — the committed fallback `'musaium-admin-export-v1'` allows trivial
 *    pseudonym dictionary attack (cf spec.md §1.1). Boot fail-fast removes the
 *    silent default in prod.
 *  - Phase-1 frozen-test contract (UFR-022) : these assertions are the SOLE
 *    source of truth for the validator shape ; green-phase MUST NOT edit them.
 *
 * Failure mode at HEAD `00325d81` :
 *  - `env.production-validation.ts` has 0 references to `EXPORT_PSEUDONYM_SALT`
 *    (verified Read 2026-05-21) → all three `throw` assertions fall through.
 *
 * Run scope :
 *   pnpm jest tests/unit/config/env.production-validation.export-salt.test.ts
 */

import { validateProductionEnv } from '@src/config/env.production-validation';

import type { AppEnv } from '@src/config/env.types';

const LONG = 'a'.repeat(64); // jwt access
const ALT_LONG = 'b'.repeat(64); // jwt refresh
const SALT_OK = 'x'.repeat(48); // >= 32 chars
const SALT_SHORT = 'x'.repeat(31); // EXACTLY one short of threshold

interface SaltOverrides {
  exportPseudonymSalt?: string;
}

/**
 * Minimal AppEnv stub — only the fields validateProductionEnv inspects in this
 * scope. Mirror the existing pattern in
 * `env-production-validation-secret-length.test.ts` to stay consistent with the
 * project's test discipline (no inline entity literal).
 */
const makeEnv = (overrides: SaltOverrides = {}): AppEnv =>
  ({
    nodeEnv: 'production',
    brevoApiKey: 'brevo',
    llm: { provider: 'openai', openAiApiKey: 'sk-test' },
    storage: { driver: 'local', s3: {} },
    cache: undefined,
    // Field under test — `env.ts` should source from process.env.EXPORT_PSEUDONYM_SALT.
    // Drift detection (mirror validateCsrfSecret) asserts the two agree.
    exportPseudonymSalt: overrides.exportPseudonymSalt,
    auth: {
      accessTokenSecret: LONG,
      refreshTokenSecret: ALT_LONG,
      mfaEncryptionKey: 'm'.repeat(48),
      mfaSessionTokenSecret: 'n'.repeat(48),
      csrfSecret: 'p'.repeat(48),
      passwordBreachCheckEnabled: true,
    },
  }) as unknown as AppEnv;

describe('validateProductionEnv — EXPORT_PSEUDONYM_SALT (R1, I-SEC5)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      PGDATABASE: 'db',
      CORS_ORIGINS: 'https://app.example.com',
      MEDIA_SIGNING_SECRET: 'media-signing-secret-long-enough-for-tests',
      JWT_ACCESS_SECRET: LONG,
      JWT_REFRESH_SECRET: ALT_LONG,
      MFA_ENCRYPTION_KEY: 'm'.repeat(48),
      MFA_SESSION_TOKEN_SECRET: 'n'.repeat(48),
      CSRF_SECRET: 'p'.repeat(48),
      EXPORT_PSEUDONYM_SALT: SALT_OK,
    };
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when EXPORT_PSEUDONYM_SALT env var is missing (R1.a)', () => {
    delete process.env.EXPORT_PSEUDONYM_SALT;

    expect(() => {
      validateProductionEnv(makeEnv({ exportPseudonymSalt: undefined }));
    }).toThrow(/EXPORT_PSEUDONYM_SALT/);
  });

  it('throws with the canonical "Missing required environment variable" message (R1.a)', () => {
    delete process.env.EXPORT_PSEUDONYM_SALT;

    expect(() => {
      validateProductionEnv(makeEnv({ exportPseudonymSalt: undefined }));
    }).toThrow(/Missing required environment variable: EXPORT_PSEUDONYM_SALT/);
  });

  it('throws when EXPORT_PSEUDONYM_SALT is exactly 31 chars (R1.b — boundary)', () => {
    process.env.EXPORT_PSEUDONYM_SALT = SALT_SHORT;

    expect(() => {
      validateProductionEnv(makeEnv({ exportPseudonymSalt: SALT_SHORT }));
    }).toThrow(/EXPORT_PSEUDONYM_SALT must be >= 32 chars in production/);
  });

  it('throws with the actual measured length in the error (R1.b)', () => {
    const ten = 'x'.repeat(10);
    process.env.EXPORT_PSEUDONYM_SALT = ten;

    expect(() => {
      validateProductionEnv(makeEnv({ exportPseudonymSalt: ten }));
    }).toThrow(/current length: 10/);
  });

  it('passes when EXPORT_PSEUDONYM_SALT is exactly 32 chars (R1.c — boundary inclusive)', () => {
    const exactly32 = 'x'.repeat(32);
    process.env.EXPORT_PSEUDONYM_SALT = exactly32;

    expect(() => {
      validateProductionEnv(makeEnv({ exportPseudonymSalt: exactly32 }));
    }).not.toThrow();
  });

  it('passes when EXPORT_PSEUDONYM_SALT is well above 32 chars (R1.c — nominal)', () => {
    expect(() => {
      validateProductionEnv(makeEnv({ exportPseudonymSalt: SALT_OK }));
    }).not.toThrow();
  });

  it('throws on env.exportPseudonymSalt vs EXPORT_PSEUDONYM_SALT wiring drift (mirror validateCsrfSecret)', () => {
    // process.env carries SALT_OK ; AppEnv has a different salt → drift detected.
    process.env.EXPORT_PSEUDONYM_SALT = SALT_OK;

    expect(() => {
      validateProductionEnv(makeEnv({ exportPseudonymSalt: 'y'.repeat(48) }));
    }).toThrow(/env\.exportPseudonymSalt is out of sync with EXPORT_PSEUDONYM_SALT/);
  });
});
