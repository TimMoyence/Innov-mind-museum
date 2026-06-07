/**
 * RED phase — run 2026-06-06-api-url-prod-safety (UFR-022).
 *
 * Pure-function unit matrix for the build-time API-URL resolvers that design
 * D1 extracts into the co-located CommonJS module
 * `museum-frontend/api-url.config.js` (zero imports, Node-require-able from
 * both `app.config.ts` build-time and from a plain Jest test with a synthetic
 * `env`).
 *
 * This module does NOT exist yet, so `require('../../api-url.config.js')`
 * throws Cannot-find-module and EVERY case below fails — that is the RED
 * success: it proves the hardening (R1–R5, R7) is absent.
 *
 * The resolvers are pure: they read nothing from a global, the `env` object is
 * always injected. No `expo-constants` mock is needed (contrast with the
 * runtime `apiConfig.test.ts`). Constant under test: `PROD_API_BASE_URL ===
 * 'https://musaium.com'` (Q1, founder-confirmed).
 */

type AppVariant = 'development' | 'preview' | 'production';
type ApiEnvironment = 'staging' | 'production';

interface RuntimeEnv {
  APP_VARIANT?: string;
  EAS_BUILD_PROFILE?: string;
  CONFIGURATION?: string;
  EXPO_PUBLIC_API_BASE_URL?: string;
  EXPO_PUBLIC_API_BASE_URL_STAGING?: string;
  EXPO_PUBLIC_API_BASE_URL_PROD?: string;
  EXPO_PUBLIC_API_ENVIRONMENT?: string;
}

interface ApiUrlConfigModule {
  PROD_API_BASE_URL: string;
  resolveVariant: (env: RuntimeEnv) => AppVariant;
  resolveApiEnvironment: (variant: AppVariant, env: RuntimeEnv) => ApiEnvironment;
  resolveApiBaseUrl: (variant: AppVariant, env: RuntimeEnv) => string;
  isLocalhostUrl: (value: string) => boolean;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the SUT is a CommonJS .js module required exactly as app.config.ts requires it (LESSONS.md:34). Justification: build-time resolvers cannot be TS-imported into app.config.ts.
const apiUrlConfig = require('../../api-url.config.js') as ApiUrlConfigModule;

const LOCALHOST = 'http://localhost:3000';
const PROD = 'https://musaium.com';

describe('api-url.config — PROD_API_BASE_URL constant (R7 / Q1)', () => {
  it('is the founder-confirmed canonical prod host', () => {
    expect(apiUrlConfig.PROD_API_BASE_URL).toBe(PROD);
  });
});

describe('api-url.config — resolveVariant precedence (D2)', () => {
  it('C1: Debug CONFIGURATION resolves development', () => {
    expect(apiUrlConfig.resolveVariant({ CONFIGURATION: 'Debug' })).toBe('development');
  });

  it('C2: Release CONFIGURATION with no APP_VARIANT resolves production (R1)', () => {
    expect(apiUrlConfig.resolveVariant({ CONFIGURATION: 'Release' })).toBe('production');
  });

  it('C3: a .env-sourced APP_VARIANT=development loses to a Release CONFIGURATION (R1 / Q2)', () => {
    expect(
      apiUrlConfig.resolveVariant({ CONFIGURATION: 'Release', APP_VARIANT: 'development' }),
    ).toBe('production');
  });

  it('C6: an explicit production APP_VARIANT beats a Debug CONFIGURATION (R5)', () => {
    expect(apiUrlConfig.resolveVariant({ APP_VARIANT: 'production', CONFIGURATION: 'Debug' })).toBe(
      'production',
    );
  });

  it('C7: EAS development profile (no CONFIGURATION) resolves development (R3 / R5)', () => {
    expect(apiUrlConfig.resolveVariant({ APP_VARIANT: 'development' })).toBe('development');
    expect(apiUrlConfig.resolveVariant({ EAS_BUILD_PROFILE: 'development' })).toBe('development');
  });

  it('C7b: an explicit preview APP_VARIANT resolves preview (R5)', () => {
    expect(apiUrlConfig.resolveVariant({ APP_VARIANT: 'preview' })).toBe('preview');
  });

  it('C9: no signal at all defaults to development (the dev/Metro loop)', () => {
    expect(apiUrlConfig.resolveVariant({})).toBe('development');
  });

  it('treats an unknown / empty CONFIGURATION as no signal (falls through to default)', () => {
    expect(apiUrlConfig.resolveVariant({ CONFIGURATION: '' })).toBe('development');
  });
});

describe('api-url.config — resolveApiEnvironment (promoted vs explicit, R1/R5)', () => {
  it('an explicit production variant honors the EXPO_PUBLIC_API_ENVIRONMENT=staging pin (EAS internal)', () => {
    // EAS `internal`: APP_VARIANT is EXPLICITLY `production` (deliberate), so the
    // staging pin is honored — a production-bundle build that intentionally
    // targets staging (R5 staging-intent signal = explicit production/preview).
    expect(
      apiUrlConfig.resolveApiEnvironment('production', {
        EXPO_PUBLIC_API_ENVIRONMENT: 'staging',
        APP_VARIANT: 'production',
      }),
    ).toBe('staging');
  });

  it('C-promoted: a Release-promoted production variant ignores the EXPO_PUBLIC_API_ENVIRONMENT=staging pin (R1)', () => {
    // Xcode Release built from the dev `.env`: variant is PROMOTED to production
    // by CONFIGURATION=Release while APP_VARIANT is a residual `development` pin.
    // The EXPO_PUBLIC_* values are dev `.env` residuals => ignored => target prod.
    expect(
      apiUrlConfig.resolveApiEnvironment('production', {
        EXPO_PUBLIC_API_ENVIRONMENT: 'staging',
        APP_VARIANT: 'development',
        CONFIGURATION: 'Release',
      }),
    ).toBe('production');
  });

  it('production variant defaults to the production environment', () => {
    expect(apiUrlConfig.resolveApiEnvironment('production', {})).toBe('production');
  });

  it('development variant defaults to the staging environment', () => {
    expect(apiUrlConfig.resolveApiEnvironment('development', {})).toBe('staging');
  });
});

describe('api-url.config — resolveApiBaseUrl default + fail-loud (D-Q4)', () => {
  it('C1: development variant keeps localhost (R3 dev loop)', () => {
    expect(apiUrlConfig.resolveApiBaseUrl('development', { CONFIGURATION: 'Debug' })).toBe(
      LOCALHOST,
    );
  });

  it('C2/C4: production variant with no explicit URL resolves the prod constant and does NOT throw (R2 / R4)', () => {
    expect(apiUrlConfig.resolveApiBaseUrl('production', {})).toBe(PROD);
  });

  it('C5: a production build IGNORES a generic EXPO_PUBLIC_API_BASE_URL=localhost (dev/LAN var) and resolves the prod constant WITHOUT throwing (corrected semantics b/c)', () => {
    // The generic EXPO_PUBLIC_API_BASE_URL is the dev/LAN override; a Release
    // Archive built from the founder's single dev `.env` (which pins
    // EXPO_PUBLIC_API_BASE_URL=http://localhost:3000 for dev:stack) must NOT
    // throw — it must ignore that generic var for prod and auto-target prod.
    expect(
      apiUrlConfig.resolveApiBaseUrl('production', {
        EXPO_PUBLIC_API_BASE_URL: LOCALHOST,
        EXPO_PUBLIC_API_ENVIRONMENT: 'production',
      }),
    ).toBe(PROD);
    expect(() =>
      apiUrlConfig.resolveApiBaseUrl('production', {
        EXPO_PUBLIC_API_BASE_URL: LOCALHOST,
        EXPO_PUBLIC_API_ENVIRONMENT: 'production',
      }),
    ).not.toThrow();
  });

  it('C5b: a production build with an empty generic EXPO_PUBLIC_API_BASE_URL resolves the prod constant WITHOUT throwing (corrected semantics b/c)', () => {
    expect(
      apiUrlConfig.resolveApiBaseUrl('production', {
        EXPO_PUBLIC_API_BASE_URL: '   ',
        EXPO_PUBLIC_API_ENVIRONMENT: 'production',
      }),
    ).toBe(PROD);
    expect(() =>
      apiUrlConfig.resolveApiBaseUrl('production', {
        EXPO_PUBLIC_API_BASE_URL: '   ',
        EXPO_PUBLIC_API_ENVIRONMENT: 'production',
      }),
    ).not.toThrow();
  });

  it('C5c: a MISCONFIGURED EXPO_PUBLIC_API_BASE_URL_PROD=localhost throws loudly (the real prod-var misconfig, corrected semantics a)', () => {
    expect(() =>
      apiUrlConfig.resolveApiBaseUrl('production', {
        EXPO_PUBLIC_API_BASE_URL_PROD: LOCALHOST,
      }),
    ).toThrow();
  });

  it('C5d: an explicit EXPO_PUBLIC_API_BASE_URL_PROD wins even when a generic localhost EXPO_PUBLIC_API_BASE_URL is also present (corrected semantics a beats b)', () => {
    expect(
      apiUrlConfig.resolveApiBaseUrl('production', {
        EXPO_PUBLIC_API_BASE_URL: LOCALHOST,
        EXPO_PUBLIC_API_BASE_URL_PROD: 'https://api.example.com',
      }),
    ).toBe('https://api.example.com');
  });

  it('C8: an explicit EXPO_PUBLIC_API_BASE_URL_PROD is honored for production (R2 / R5)', () => {
    expect(
      apiUrlConfig.resolveApiBaseUrl('production', {
        EXPO_PUBLIC_API_BASE_URL_PROD: 'https://api.musaium.com',
      }),
    ).toBe('https://api.musaium.com');
  });

  it('C9: default (no signal) development resolves localhost without throwing (R3)', () => {
    expect(apiUrlConfig.resolveApiBaseUrl('development', {})).toBe(LOCALHOST);
  });

  it('a preview build pointed at localhost (LAN dev-client) does NOT throw at build time', () => {
    expect(() =>
      apiUrlConfig.resolveApiBaseUrl('preview', { EXPO_PUBLIC_API_BASE_URL: LOCALHOST }),
    ).not.toThrow();
  });
});

describe('api-url.config — isLocalhostUrl (R7 single loopback source of truth)', () => {
  it('detects localhost / loopback hosts', () => {
    expect(apiUrlConfig.isLocalhostUrl('http://localhost:3000')).toBe(true);
    expect(apiUrlConfig.isLocalhostUrl('http://127.0.0.1:3000')).toBe(true);
    expect(apiUrlConfig.isLocalhostUrl('http://[::1]:3000')).toBe(true);
  });

  it('returns false for a remote https host', () => {
    expect(apiUrlConfig.isLocalhostUrl(PROD)).toBe(false);
    expect(apiUrlConfig.isLocalhostUrl('https://api.musaium.com')).toBe(false);
  });
});
