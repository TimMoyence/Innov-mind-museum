import { validateProductionEnv } from '@src/config/env.production-validation';
import type { AppEnv } from '@src/config/env.types';

const LONG = 'a'.repeat(64);
const ALT_LONG = 'b'.repeat(64);
const EXPORT_SALT = 'g'.repeat(48);

const makeEnv = (overrides: Partial<AppEnv['auth']> = {}): AppEnv =>
  ({
    nodeEnv: 'production',
    brevoApiKey: 'brevo',
    llm: { costGuard: { userDailyCapUsd: 0 }, provider: 'openai', openAiApiKey: 'sk-test' },
    storage: { driver: 'local', s3: {} },
    cache: undefined,
    exportPseudonymSalt: EXPORT_SALT,
    auth: {
      accessTokenSecret: LONG,
      refreshTokenSecret: ALT_LONG,
      csrfSecret: 'p'.repeat(48),
      passwordBreachCheckEnabled: true,
      ...overrides,
    },
  }) as unknown as AppEnv;

describe('validateProductionEnv — JWT secret hardening', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PGDATABASE: 'db',
      CORS_ORIGINS: 'https://app.example.com',
      MEDIA_SIGNING_SECRET: 'media-signing-secret-long-enough-for-tests',
      JWT_ACCESS_SECRET: LONG,
      JWT_REFRESH_SECRET: ALT_LONG,
      CSRF_SECRET: 'p'.repeat(48),
      EXPORT_PSEUDONYM_SALT: EXPORT_SALT,
    };
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('passes when both secrets are >= 32 chars and distinct', () => {
    expect(() => {
      validateProductionEnv(makeEnv());
    }).not.toThrow();
  });

  it('throws when JWT_ACCESS_SECRET is shorter than 32 chars (L2)', () => {
    const shortSecret = 'a'.repeat(16);
    process.env.JWT_ACCESS_SECRET = shortSecret;
    const env = makeEnv({ accessTokenSecret: shortSecret });

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/JWT_ACCESS_SECRET must be >= 32 chars in production .*current length: 16/);
  });

  it('throws when JWT_REFRESH_SECRET is shorter than 32 chars (L2)', () => {
    const shortSecret = 'b'.repeat(10);
    process.env.JWT_REFRESH_SECRET = shortSecret;
    const env = makeEnv({ refreshTokenSecret: shortSecret });

    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/JWT_REFRESH_SECRET must be >= 32 chars in production .*current length: 10/);
  });

  it('throws when JWT_ACCESS_SECRET env var is missing (H12 — no JWT_SECRET fallback)', () => {
    delete process.env.JWT_ACCESS_SECRET;
    process.env.JWT_SECRET = LONG;

    expect(() => {
      validateProductionEnv(makeEnv());
    }).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('throws when access and refresh secrets are identical', () => {
    const env = makeEnv({ accessTokenSecret: LONG, refreshTokenSecret: LONG });
    expect(() => {
      validateProductionEnv(env);
    }).toThrow(/JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct/);
  });

  it('warns (but does not throw) when legacy JWT_SECRET is still exported in prod (H12)', () => {
    process.env.JWT_SECRET = 'legacy-secret-should-be-removed';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      expect(() => {
        validateProductionEnv(makeEnv());
      }).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('JWT_SECRET is set in production'),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  describe('MEDIA_SIGNING_SECRET (L3)', () => {
    it('throws when MEDIA_SIGNING_SECRET is missing', () => {
      delete process.env.MEDIA_SIGNING_SECRET;
      expect(() => {
        validateProductionEnv(makeEnv());
      }).toThrow(/MEDIA_SIGNING_SECRET/);
    });

    it('throws when MEDIA_SIGNING_SECRET equals JWT_ACCESS_SECRET', () => {
      process.env.MEDIA_SIGNING_SECRET = LONG;
      expect(() => {
        validateProductionEnv(makeEnv());
      }).toThrow(/MEDIA_SIGNING_SECRET must be distinct from JWT_ACCESS_SECRET/);
    });

    it('throws when MEDIA_SIGNING_SECRET equals JWT_REFRESH_SECRET', () => {
      process.env.MEDIA_SIGNING_SECRET = ALT_LONG;
      expect(() => {
        validateProductionEnv(makeEnv());
      }).toThrow(/MEDIA_SIGNING_SECRET must be distinct from JWT_REFRESH_SECRET/);
    });

    it('passes when MEDIA_SIGNING_SECRET is set and distinct from JWT secrets', () => {
      process.env.MEDIA_SIGNING_SECRET = 'c'.repeat(48);
      expect(() => {
        validateProductionEnv(makeEnv());
      }).not.toThrow();
    });
  });

  describe('CSRF_SECRET (F7)', () => {
    it('throws when CSRF_SECRET is missing', () => {
      delete process.env.CSRF_SECRET;
      expect(() => {
        validateProductionEnv(makeEnv());
      }).toThrow(/CSRF_SECRET/);
    });

    it('throws when CSRF_SECRET is shorter than 32 chars', () => {
      const short = 'p'.repeat(16);
      process.env.CSRF_SECRET = short;
      expect(() => {
        validateProductionEnv(makeEnv({ csrfSecret: short }));
      }).toThrow(/CSRF_SECRET must be >= 32 chars/);
    });

    it('throws when CSRF_SECRET equals JWT_ACCESS_SECRET', () => {
      process.env.CSRF_SECRET = LONG;
      expect(() => {
        validateProductionEnv(makeEnv({ csrfSecret: LONG }));
      }).toThrow(/CSRF_SECRET must be distinct from JWT_ACCESS_SECRET/);
    });

    it('throws when CSRF_SECRET equals JWT_REFRESH_SECRET', () => {
      process.env.CSRF_SECRET = ALT_LONG;
      expect(() => {
        validateProductionEnv(makeEnv({ csrfSecret: ALT_LONG }));
      }).toThrow(/CSRF_SECRET must be distinct from JWT_REFRESH_SECRET/);
    });

    it('throws when CSRF_SECRET equals MEDIA_SIGNING_SECRET', () => {
      const shared = 'c'.repeat(48);
      process.env.MEDIA_SIGNING_SECRET = shared;
      process.env.CSRF_SECRET = shared;
      expect(() => {
        validateProductionEnv(makeEnv({ csrfSecret: shared }));
      }).toThrow(/CSRF_SECRET must be distinct from MEDIA_SIGNING_SECRET/);
    });

    it('throws when env.auth.csrfSecret drifts from raw CSRF_SECRET (wiring drift)', () => {
      process.env.CSRF_SECRET = 'p'.repeat(48);
      expect(() => {
        validateProductionEnv(makeEnv({ csrfSecret: 'q'.repeat(48) }));
      }).toThrow(/env\.auth\.csrfSecret is out of sync with CSRF_SECRET/);
    });

    it('passes when CSRF_SECRET is set and distinct from every other signing secret', () => {
      process.env.CSRF_SECRET = 'p'.repeat(48);
      expect(() => {
        validateProductionEnv(makeEnv());
      }).not.toThrow();
    });
  });
});
