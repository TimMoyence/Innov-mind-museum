jest.mock('expo-constants', () => ({
  expoConfig: { extra: {} },
}));

import {
  buildApiUrl,
  buildHealthUrl,
  getStartupConfigurationError,
  isLocalhostApiBaseUrl,
} from '@/shared/infrastructure/apiConfig';

import type * as ApiConfigModuleNS from '@/shared/infrastructure/apiConfig';

type ConfigModule = typeof ApiConfigModuleNS;

const loadFreshConfigModule = (): ConfigModule => {
  let mod!: ConfigModule;
  jest.isolateModules(() => {
    mod = jest.requireActual<ConfigModule>('@/shared/infrastructure/apiConfig');
  });
  return mod;
};

describe('isLocalhostApiBaseUrl', () => {
  it('returns true for localhost URL', () => {
    expect(isLocalhostApiBaseUrl('http://localhost:3000')).toBe(true);
  });

  it('returns true for 127.0.0.1', () => {
    expect(isLocalhostApiBaseUrl('http://127.0.0.1:3000')).toBe(true);
  });

  it('returns true for ::1', () => {
    expect(isLocalhostApiBaseUrl('http://[::1]:3000')).toBe(true);
  });

  it('returns false for remote URL', () => {
    expect(isLocalhostApiBaseUrl('https://api.musaium.com')).toBe(false);
  });

  it('handles invalid URL by falling back to string check', () => {
    expect(isLocalhostApiBaseUrl('not-a-url-localhost')).toBe(true);
    expect(isLocalhostApiBaseUrl('not-a-url-remote')).toBe(false);
  });
});

describe('buildApiUrl', () => {
  it('concatenates base URL and path', () => {
    expect(buildApiUrl('https://api.test.com', '/api/health')).toBe(
      'https://api.test.com/api/health',
    );
  });

  it('strips trailing slashes from base URL', () => {
    expect(buildApiUrl('https://api.test.com/', '/api/health')).toBe(
      'https://api.test.com/api/health',
    );
  });

  it('adds leading slash to path if missing', () => {
    expect(buildApiUrl('https://api.test.com', 'api/health')).toBe(
      'https://api.test.com/api/health',
    );
  });

  it('handles empty path', () => {
    expect(buildApiUrl('https://api.test.com', '')).toBe('https://api.test.com/');
  });
});

describe('buildHealthUrl', () => {
  it('builds the health endpoint URL', () => {
    expect(buildHealthUrl('https://api.test.com')).toBe('https://api.test.com/api/health');
  });
});

describe('getStartupConfigurationError', () => {
  it('returns null when configuration is valid (development mode)', () => {
    const error = getStartupConfigurationError();
    expect(error).toBeNull();
  });
});

describe('apiConfig — environment + build variant resolution', () => {
  // jest.isolateModulesAsync gives every test a fresh module graph so the
  // env-var-driven branches (APP_VARIANT / EAS_BUILD_PROFILE / EXPO_PUBLIC_*)
  // don't leak across cases.
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const loadFresh = loadFreshConfigModule;

  it('resolves production variant from APP_VARIANT=production', () => {
    process.env.APP_VARIANT = 'production';
    process.env.EXPO_PUBLIC_API_BASE_URL_PROD = 'https://api.musaium.com';
    const snap = loadFresh().getApiConfigurationSnapshot();
    expect(snap.buildVariant).toBe('production');
    expect(snap.apiEnvironment).toBe('production');
    expect(snap.resolvedBaseUrl).toBe('https://api.musaium.com');
  });

  it('resolves preview variant from EAS_BUILD_PROFILE=preview (staging API)', () => {
    delete process.env.APP_VARIANT;
    process.env.EAS_BUILD_PROFILE = 'preview';
    process.env.EXPO_PUBLIC_API_BASE_URL_STAGING = 'https://staging.musaium.com';
    const snap = loadFresh().getApiConfigurationSnapshot();
    expect(snap.buildVariant).toBe('preview');
    expect(snap.apiEnvironment).toBe('staging');
    expect(snap.resolvedBaseUrl).toBe('https://staging.musaium.com');
  });

  it('strips trailing slashes from configured base URLs', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test.com///';
    expect(loadFresh().getApiConfigurationSnapshot().fallbackBaseUrl).toBe('https://api.test.com');
  });

  it('honours EXPO_PUBLIC_API_ENVIRONMENT override (staging/production)', () => {
    process.env.APP_VARIANT = 'production';
    process.env.EXPO_PUBLIC_API_ENVIRONMENT = 'staging';
    process.env.EXPO_PUBLIC_API_BASE_URL_STAGING = 'https://staging.musaium.com';
    expect(loadFresh().getApiConfigurationSnapshot().apiEnvironment).toBe('staging');
  });

  it('ignores invalid EXPO_PUBLIC_API_ENVIRONMENT values', () => {
    process.env.EXPO_PUBLIC_API_ENVIRONMENT = 'gibberish';
    expect(['staging', 'production']).toContain(
      loadFresh().getApiConfigurationSnapshot().apiEnvironment,
    );
  });

  it('treats "custom" environment override as falling through to a configured base URL', () => {
    // 'custom' explicit is intentionally rejected as default — the resolver
    // requires a runtime caller to pass the customUrl. Default branch falls
    // back to staging (or production for prod builds).
    process.env.EXPO_PUBLIC_API_ENVIRONMENT = 'custom';
    expect(['staging', 'production']).toContain(
      loadFresh().getApiConfigurationSnapshot().apiEnvironment,
    );
  });
});

describe('apiConfig — assertApiBaseUrlAllowed (preview/prod localhost block)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const loadFresh = loadFreshConfigModule;

  it('rejects localhost in production builds', () => {
    process.env.APP_VARIANT = 'production';
    expect(() => {
      loadFresh().assertApiBaseUrlAllowed('http://localhost:3000');
    }).toThrow(/Localhost backend URL is blocked/);
  });

  it('allows non-localhost in production builds', () => {
    process.env.APP_VARIANT = 'production';
    expect(() => {
      loadFresh().assertApiBaseUrlAllowed('https://api.musaium.com');
    }).not.toThrow();
  });

  it('allows localhost in development builds', () => {
    process.env.APP_VARIANT = 'development';
    expect(() => {
      loadFresh().assertApiBaseUrlAllowed('http://localhost:3000');
    }).not.toThrow();
  });
});

describe('apiConfig — tryResolveInitialApiBaseUrl', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const loadFresh = loadFreshConfigModule;

  it('returns the resolved URL and a non-null error in preview when localhost is the only base URL', () => {
    process.env.APP_VARIANT = 'preview';
    delete process.env.EXPO_PUBLIC_API_BASE_URL_STAGING;
    delete process.env.EXPO_PUBLIC_API_BASE_URL_PROD;
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    const { url, error } = loadFresh().tryResolveInitialApiBaseUrl();
    expect(url).toMatch(/localhost/);
    expect(error).not.toBeNull();
  });

  it('returns null error when configured staging URL is non-localhost in preview', () => {
    process.env.APP_VARIANT = 'preview';
    process.env.EXPO_PUBLIC_API_BASE_URL_STAGING = 'https://staging.musaium.com';
    const { url, error } = loadFresh().tryResolveInitialApiBaseUrl();
    expect(url).toBe('https://staging.musaium.com');
    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RED phase — run 2026-06-06-api-url-prod-safety (UFR-022), T1.2 / C10 / R6.
//
// The reported defect: a local Xcode Release/Archive binary had NO system
// `APP_VARIANT`; its variant was frozen into `Constants.expoConfig.extra`
// at the app-config build phase. After the P1 fix that build is stamped
// `extra.APP_VARIANT='production'`, so the runtime guard must treat it as a
// production build and REJECT localhost — it must NOT be exempted as
// "development".
//
// This block exercises the build-time-frozen `extra.APP_VARIANT` path
// specifically (no `process.env.APP_VARIANT`), which `resolveBuildVariant`
// reads via `readExtra()` on every call. Per design.md D3, R6 is satisfied
// primarily by P1 (Release => variant 'production' => guard active); these
// are the regression-lock tests that pin that contract and would catch any
// regression that re-opens the localhost-in-release hole.
// ---------------------------------------------------------------------------
describe('apiConfig — R6: build-time-stamped variant drives the localhost guard', () => {
  const originalEnv = { ...process.env };

  // The module-level jest.mock returns a mutable `expoConfig` object;
  // `resolveBuildVariant()` reads `Constants.expoConfig.extra.APP_VARIANT`
  // fresh on each call, so reassigning `expoConfig.extra` here simulates the
  // frozen build-time stamp without a second mock module. We replace the whole
  // `extra` reference (no dynamic key delete) and restore it afterwards.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- mirror the module under test which consumes Constants.expoConfig.extra at call time. Justification: must reach the same mocked Constants object the SUT reads.
  const Constants = require('expo-constants') as {
    expoConfig: { extra: Record<string, unknown> };
  };
  const originalExtra: Record<string, unknown> = { ...Constants.expoConfig.extra };

  const setExtra = (extra: Record<string, unknown>): void => {
    Constants.expoConfig.extra = { ...extra };
  };

  afterEach(() => {
    process.env = { ...originalEnv };
    setExtra(originalExtra);
  });

  const loadFresh = loadFreshConfigModule;

  it('C10: a Release binary stamped extra.APP_VARIANT=production rejects localhost (no env APP_VARIANT)', () => {
    delete process.env.APP_VARIANT;
    delete process.env.EAS_BUILD_PROFILE;
    setExtra({ APP_VARIANT: 'production' });
    expect(() => {
      loadFresh().assertApiBaseUrlAllowed('http://localhost:3000');
    }).toThrow(/Localhost backend URL is blocked/);
  });

  it('C10b: a genuine development extra still exempts localhost (dev loop preserved)', () => {
    delete process.env.APP_VARIANT;
    delete process.env.EAS_BUILD_PROFILE;
    setExtra({ APP_VARIANT: 'development' });
    expect(() => {
      loadFresh().assertApiBaseUrlAllowed('http://localhost:3000');
    }).not.toThrow();
  });

  it('C10c: getStartupConfigurationError is non-null for a Release binary resolving to localhost', () => {
    delete process.env.APP_VARIANT;
    delete process.env.EAS_BUILD_PROFILE;
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_API_BASE_URL_STAGING;
    delete process.env.EXPO_PUBLIC_API_BASE_URL_PROD;
    // production stamp + only a localhost base url available => startup error.
    setExtra({ APP_VARIANT: 'production', API_BASE_URL: 'http://localhost:3000' });
    expect(loadFresh().getStartupConfigurationError()).not.toBeNull();
  });
});
