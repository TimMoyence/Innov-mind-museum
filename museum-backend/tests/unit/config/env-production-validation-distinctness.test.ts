import { validateProductionEnv } from '@src/config/env.production-validation';
import {
  VALID_CSRF_SECRET,
  VALID_EXPORT_PSEUDONYM_SALT,
  VALID_JWT_ACCESS_SECRET,
  VALID_JWT_REFRESH_SECRET,
  VALID_MEDIA_SIGNING_SECRET,
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
    exportPseudonymSalt: VALID_EXPORT_PSEUDONYM_SALT,
    auth: {
      accessTokenSecret: VALID_JWT_ACCESS_SECRET,
      refreshTokenSecret: VALID_JWT_REFRESH_SECRET,
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

  it('GAP-1: MEDIA_SIGNING_SECRET shorter than 32 chars → throws length error', () => {
    const short = 'a'.repeat(8);
    process.env.MEDIA_SIGNING_SECRET = short;

    expect(() => {
      validateProductionEnv(makeEnv());
    }).toThrow(/MEDIA_SIGNING_SECRET must be >= 32 chars in production .*current length: 8/);
  });
});

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
