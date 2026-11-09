import { validateProductionEnv } from '@src/config/env.production-validation';
import type { AppEnv } from '@src/config/env.types';
import {
  VALID_CSRF_SECRET,
  VALID_EXPORT_PSEUDONYM_SALT,
  VALID_JWT_ACCESS_SECRET,
  VALID_JWT_REFRESH_SECRET,
  VALID_MEDIA_SIGNING_SECRET,
} from '../../helpers/config/prod-env.fixtures';

const STRONG_REDIS_PASSWORD = 'r'.repeat(48);

interface MakeEnvOptions {
  userDailyCapUsd?: number;
  cacheEnabled?: boolean;
}

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
      CSRF_SECRET: VALID_CSRF_SECRET,
      EXPORT_PSEUDONYM_SALT: VALID_EXPORT_PSEUDONYM_SALT,
      OPENAI_API_KEY: 'sk-test',
    };
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
