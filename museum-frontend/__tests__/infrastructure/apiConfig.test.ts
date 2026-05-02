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
