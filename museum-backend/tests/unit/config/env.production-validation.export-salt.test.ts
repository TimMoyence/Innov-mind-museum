import { validateProductionEnv } from '@src/config/env.production-validation';

import type { AppEnv } from '@src/config/env.types';

const LONG = 'a'.repeat(64);
const ALT_LONG = 'b'.repeat(64);
const SALT_OK = 'x'.repeat(48);
const SALT_SHORT = 'x'.repeat(31);

interface SaltOverrides {
  exportPseudonymSalt?: string;
}

const makeEnv = (overrides: SaltOverrides = {}): AppEnv =>
  ({
    nodeEnv: 'production',
    brevoApiKey: 'brevo',
    llm: { costGuard: { userDailyCapUsd: 0 }, provider: 'openai', openAiApiKey: 'sk-test' },
    storage: { driver: 'local', s3: {} },
    cache: undefined,
    exportPseudonymSalt: overrides.exportPseudonymSalt,
    auth: {
      accessTokenSecret: LONG,
      refreshTokenSecret: ALT_LONG,
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
    process.env.EXPORT_PSEUDONYM_SALT = SALT_OK;

    expect(() => {
      validateProductionEnv(makeEnv({ exportPseudonymSalt: 'y'.repeat(48) }));
    }).toThrow(/env\.exportPseudonymSalt is out of sync with EXPORT_PSEUDONYM_SALT/);
  });
});
