import Constants from 'expo-constants';

import { readEnvString } from '@/shared/lib/env';

// Single source of truth for the loopback regex + canonical prod host
// (run 2026-06-06-api-url-prod-safety, spec R7 / DRY). The build-time path
// (`app.config.ts`) and this runtime path BOTH consume the same `.js` module so
// the localhost-detection regex can never drift between them. Unlike
// `app.config.ts`, this runtime TS file is bundled by Metro (which DOES resolve
// the relative `.js`), so a normal `import` is licit here — the no-TS-import
// constraint is `app.config.ts`-specific only.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the shared resolver module is a plain CommonJS `.js` (it must be require-able by app.config.ts); a typed `import` of a non-typed `.js` would need a `.d.ts`. Justification: keep ONE loopback regex + prod-host literal (spec R7) without adding a declaration file.
const { isLocalhostUrl: isLoopbackUrl } = require('../../api-url.config.js') as {
  isLocalhostUrl: (value: string) => boolean;
  PROD_API_BASE_URL: string;
};

/** Target API environment the app is configured to communicate with. */
type ApiEnvironment = 'staging' | 'production' | 'custom';

/** EAS / Expo build variant determining app behavior and allowed configurations. */
type BuildVariant = 'development' | 'preview' | 'production';

/** Snapshot of the resolved API configuration at a point in time, used for diagnostics. */
export interface ApiConfigurationSnapshot {
  buildVariant: BuildVariant;
  apiEnvironment: ApiEnvironment;
  fallbackBaseUrl: string;
  stagingBaseUrl?: string;
  productionBaseUrl?: string;
  resolvedBaseUrl: string;
}

const normalizeApiEnvironment = (value: unknown): ApiEnvironment | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'staging' || normalized === 'production' || normalized === 'custom') {
    return normalized;
  }

  return undefined;
};

const ensureLeadingSlash = (path: string): string => {
  if (!path.length) {
    return '/';
  }

  return path.startsWith('/') ? path : `/${path}`;
};

const normalizeBaseUrl = (value: string): string => {
  return value.replace(/\/+$/, '');
};

const readExtra = (): Record<string, unknown> => {
  return (Constants.expoConfig as { extra?: Record<string, unknown> } | undefined)?.extra ?? {};
};

const resolveBuildVariant = (): BuildVariant => {
  const extra = readExtra();
  const fromExtra = readEnvString(extra.APP_VARIANT);
  const raw: string = (
    readEnvString(process.env.APP_VARIANT) ??
    readEnvString(process.env.EAS_BUILD_PROFILE) ??
    fromExtra ??
    'development'
  ).toLowerCase();

  if (raw === 'production') {
    return 'production';
  }
  if (raw === 'preview') {
    return 'preview';
  }
  return 'development';
};

const resolveConfiguredBaseUrls = (): {
  explicit?: string;
  fallback: string;
  staging?: string;
  production?: string;
} => {
  const extra = readExtra();
  // `extra.API_BASE_URL` is the build-time-resolved decision (app.config.ts
  // stamps it via api-url.config.js `resolveApiBaseUrl`, promotion + prod-host
  // included; never localhost for a prod build) → AUTHORITATIVE over the raw
  // Metro-inlined dev `.env` pin (spec R1/R2/R6 — single decision point, no
  // build-time↔runtime re-divergence). `process.env.EXPO_PUBLIC_API_BASE_URL`
  // stays the fallback for jsdom/test where `extra` is absent (R8).
  const explicit =
    readEnvString(extra.API_BASE_URL) ?? readEnvString(process.env.EXPO_PUBLIC_API_BASE_URL);

  const staging =
    readEnvString(process.env.EXPO_PUBLIC_API_BASE_URL_STAGING) ??
    readEnvString(extra.API_BASE_URL_STAGING);

  const production =
    readEnvString(process.env.EXPO_PUBLIC_API_BASE_URL_PROD) ??
    readEnvString(extra.API_BASE_URL_PRODUCTION);

  return {
    explicit: explicit ? normalizeBaseUrl(explicit) : undefined,
    fallback: normalizeBaseUrl(explicit ?? 'http://localhost:3000'),
    staging: staging ? normalizeBaseUrl(staging) : undefined,
    production: production ? normalizeBaseUrl(production) : undefined,
  };
};

/**
 * Checks whether a URL points to a localhost address.
 *
 * Delegates to the single loopback source of truth in
 * `museum-frontend/api-url.config.js` (spec R7 / DRY) so the build-time and
 * runtime localhost checks can never diverge. Kept as an exported wrapper for
 * back-compat with existing callers + tests.
 * @param value - URL string to test.
 * @returns `true` if the hostname is a loopback address.
 */
export const isLocalhostApiBaseUrl = (value: string): boolean => isLoopbackUrl(value);

/**
 * Determines the default API environment from env vars, Expo config, or the build variant.
 * @returns The resolved {@link ApiEnvironment}.
 */
const getDefaultApiEnvironment = (): ApiEnvironment => {
  const extra = readExtra();
  // `extra.API_ENVIRONMENT` is the build-time-resolved decision (app.config.ts
  // stamps it via api-url.config.js `resolveApiEnvironment`, promotion
  // included) → AUTHORITATIVE over the raw Metro-inlined dev `.env` pin
  // (spec R1/R6 — single decision point). `process.env.EXPO_PUBLIC_API_ENVIRONMENT`
  // stays the fallback for jsdom/test where `extra` is absent (R8).
  // TD-RN-03 — canonical helper (CLAUDE.md gotcha § process.env local-vs-CI).
  const explicit =
    normalizeApiEnvironment(extra.API_ENVIRONMENT) ??
    normalizeApiEnvironment(readEnvString(process.env.EXPO_PUBLIC_API_ENVIRONMENT));

  if (explicit && explicit !== 'custom') {
    return explicit;
  }

  return resolveBuildVariant() === 'production' ? 'production' : 'staging';
};

/**
 * Resolves the backend base URL for a given API environment.
 * @param environment - Target API environment.
 * @param customUrl - Optional user-provided URL used when environment is `'custom'`.
 * @returns Normalized base URL string without a trailing slash.
 */
const resolveRuntimeApiBaseUrl = (environment: ApiEnvironment, customUrl?: string): string => {
  const configured = resolveConfiguredBaseUrls();
  const custom = readEnvString(customUrl);

  if (environment === 'custom') {
    return normalizeBaseUrl(custom ?? configured.fallback);
  }

  if (environment === 'production') {
    return configured.production ?? configured.explicit ?? configured.fallback;
  }

  return configured.explicit ?? configured.staging ?? configured.fallback;
};

/**
 * Builds a diagnostic snapshot of the current API configuration.
 * @returns An {@link ApiConfigurationSnapshot} reflecting build variant, environment, and URLs.
 */
export const getApiConfigurationSnapshot = (): ApiConfigurationSnapshot => {
  const configured = resolveConfiguredBaseUrls();
  const apiEnvironment = getDefaultApiEnvironment();

  return {
    buildVariant: resolveBuildVariant(),
    apiEnvironment,
    fallbackBaseUrl: configured.fallback,
    stagingBaseUrl: configured.staging,
    productionBaseUrl: configured.production,
    resolvedBaseUrl: resolveRuntimeApiBaseUrl(apiEnvironment),
  };
};

/**
 * Throws if the given URL targets localhost in a non-development build.
 * @param value - Base URL to validate.
 * @throws When localhost is used in preview or production builds.
 */
export const assertApiBaseUrlAllowed = (value: string): void => {
  const variant = resolveBuildVariant();
  if (variant !== 'development' && isLocalhostApiBaseUrl(value)) {
    throw new Error(
      'Localhost backend URL is blocked for preview/production builds. Configure staging or production API URL.',
    );
  }
};

/**
 * Resolves and validates the initial API base URL at app startup.
 * @returns The validated base URL.
 * @throws When the resolved URL is not allowed for the current build variant.
 */
export const resolveInitialApiBaseUrl = (): string => {
  const url = resolveRuntimeApiBaseUrl(getDefaultApiEnvironment());
  assertApiBaseUrlAllowed(url);
  return url;
};

/**
 * Attempts to resolve the initial API base URL and captures any configuration error.
 * @returns An `Error` if the configuration is invalid, or `null` when valid.
 */
export const getStartupConfigurationError = (): Error | null => {
  try {
    resolveInitialApiBaseUrl();
    return null;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    return new Error('Invalid app startup configuration');
  }
};

/**
 * Resolves the initial API base URL, returning both the URL and any startup error.
 * @returns An object with the resolved `url` and an `error` (or `null`).
 */
export const tryResolveInitialApiBaseUrl = (): {
  url: string;
  error: Error | null;
} => {
  const snapshot = getApiConfigurationSnapshot();
  const error = getStartupConfigurationError();

  return {
    url: snapshot.resolvedBaseUrl,
    error,
  };
};

const API_PREFIX = '/api';
const HEALTH_PATH = `${API_PREFIX}/health`;

/**
 * Concatenates a base URL with an API path, normalizing slashes.
 * @param baseUrl - Backend base URL.
 * @param path - API path segment.
 * @returns Fully qualified URL string.
 */
export const buildApiUrl = (baseUrl: string, path: string): string => {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  return `${normalizedBase}${ensureLeadingSlash(path)}`;
};

/**
 * Builds the health-check endpoint URL for a given base URL.
 * @param baseUrl - Backend base URL.
 * @returns Full health endpoint URL.
 */
export const buildHealthUrl = (baseUrl: string): string => {
  return buildApiUrl(baseUrl, HEALTH_PATH);
};
