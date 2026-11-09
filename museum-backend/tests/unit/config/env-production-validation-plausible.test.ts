import { validateProductionEnv } from '@src/config/env.production-validation';
import {
  VALID_CSRF_SECRET,
  VALID_EXPORT_PSEUDONYM_SALT,
  VALID_JWT_ACCESS_SECRET,
  VALID_JWT_REFRESH_SECRET,
  validProductionEnv,
} from 'tests/helpers/config/prod-env.fixtures';

import type { AppEnv } from '@src/config/env.types';

interface PlausibleStub {
  domain?: string;
  endpointUrl?: string;
}

const makeEnv = (plausible: PlausibleStub | undefined): AppEnv =>
  ({
    nodeEnv: 'production',
    brevoApiKey: 'brevo',
    llm: { costGuard: { userDailyCapUsd: 0 }, provider: 'openai', openAiApiKey: 'sk-test' },
    storage: { driver: 'local', s3: {} },
    cache: undefined,
    exportPseudonymSalt: VALID_EXPORT_PSEUDONYM_SALT,
    plausible,
    auth: {
      accessTokenSecret: VALID_JWT_ACCESS_SECRET,
      refreshTokenSecret: VALID_JWT_REFRESH_SECRET,
      csrfSecret: VALID_CSRF_SECRET,
      passwordBreachCheckEnabled: true,
    },
  }) as unknown as AppEnv;

const warnedWith = (warnSpy: jest.SpyInstance, needle: string): boolean =>
  warnSpy.mock.calls.some((args) =>
    args.some((arg: unknown) => typeof arg === 'string' && arg.includes(needle)),
  );

describe('validateProductionEnv — Plausible analytics WARN (C3.2)', () => {
  const originalEnv = { ...process.env };
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv, ...validProductionEnv() } as NodeJS.ProcessEnv;
    delete process.env.JWT_SECRET;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  it('AC-C3.2.a/b — both Plausible vars absent → warns (names both vars) and does NOT throw', () => {
    const env = makeEnv({ domain: undefined, endpointUrl: undefined });

    expect(() => {
      validateProductionEnv(env);
    }).not.toThrow();
    expect(warnedWith(warnSpy, 'PLAUSIBLE_DOMAIN')).toBe(true);
    expect(warnedWith(warnSpy, 'PLAUSIBLE_ENDPOINT_URL')).toBe(true);
  });

  it('AC-C3.2.c — only endpointUrl missing → warn names PLAUSIBLE_ENDPOINT_URL', () => {
    const env = makeEnv({ domain: 'musaium.com', endpointUrl: undefined });

    expect(() => {
      validateProductionEnv(env);
    }).not.toThrow();
    expect(warnedWith(warnSpy, 'PLAUSIBLE_ENDPOINT_URL')).toBe(true);
  });

  it('REQ-C3.2.3 — both Plausible vars present → NO Plausible warn', () => {
    const env = makeEnv({
      domain: 'musaium.com',
      endpointUrl: 'https://plausible.example/api/event',
    });

    expect(() => {
      validateProductionEnv(env);
    }).not.toThrow();
    expect(warnedWith(warnSpy, 'PLAUSIBLE')).toBe(false);
  });
});
