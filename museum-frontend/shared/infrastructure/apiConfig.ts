import Constants from 'expo-constants';

/** Target API environment the app is configured to communicate with. */
export type ApiEnvironment = 'staging' | 'production' | 'custom';

/** EAS / Expo build variant determining app behavior and allowed configurations. */
export type BuildVariant = 'development' | 'preview' | 'production';

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

const trimOrUndefined = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const normalizeBaseUrl = (value: string): string => {
  return value.replace(/\/+$/, '');
};

const readExtra = (): Record<string, unknown> => {
  return (
    (Constants?.expoConfig as { extra?: Record<string, unknown> } | undefined)
      ?.extra || {}
  );
};

const resolveBuildVariant = (): BuildVariant => {
  const extra = readExtra();
  const fromExtra = trimOrUndefined(extra.APP_VARIANT);
  const raw = (
    process.env.APP_VARIANT ||
    process.env.EAS_BUILD_PROFILE ||
    fromExtra ||
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
  const explicit =
    trimOrUndefined(process.env.EXPO_PUBLIC_API_BASE_URL) ||
    trimOrUndefined(extra.API_BASE_URL);

  const staging =
    trimOrUndefined(process.env.EXPO_PUBLIC_API_BASE_URL_STAGING) ||
    trimOrUndefined(extra.API_BASE_URL_STAGING);

  const production =
    trimOrUndefined(process.env.EXPO_PUBLIC_API_BASE_URL_PROD) ||
    trimOrUndefined(extra.API_BASE_URL_PRODUCTION);

  return {
    explicit: explicit ? normalizeBaseUrl(explicit) : undefined,
    fallback: normalizeBaseUrl(explicit || 'http://localhost:3000'),
    staging: staging ? normalizeBaseUrl(staging) : undefined,
    production: production ? normalizeBaseUrl(production) : undefined,
  };
};

const localhostPattern =
  /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|::1)$/i;

/**
 * Checks whether a URL points to a localhost address.
 * @param value - URL string to test.
 * @returns `true` if the hostname is a loopback address.
 */
export const isLocalhostApiBaseUrl = (value: string): boolean => {
  try {
    const hostname = new URL(value).hostname;
    return localhostPattern.test(hostname);
  } catch {
    return value.includes('localhost') || value.includes('127.0.0.1');
  }
};

/**
 * Determines the default API environment from env vars, Expo config, or the build variant.
 * @returns The resolved {@link ApiEnvironment}.
 */
export const getDefaultApiEnvironment = (): ApiEnvironment => {
  const extra = readExtra();
  const explicit =
    normalizeApiEnvironment(process.env.EXPO_PUBLIC_API_ENVIRONMENT) ||
    normalizeApiEnvironment(extra.API_ENVIRONMENT);

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
export const resolveRuntimeApiBaseUrl = (
  environment: ApiEnvironment,
  customUrl?: string,
): string => {
  const configured = resolveConfiguredBaseUrls();
  const custom = trimOrUndefined(customUrl);

  if (environment === 'custom') {
    return normalizeBaseUrl(custom || configured.fallback);
  }

  if (environment === 'production') {
    return configured.production || configured.explicit || configured.fallback;
  }

  return configured.explicit || configured.staging || configured.fallback;
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
const AUTH_BASE_PATH = `${API_PREFIX}/auth`;
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

/** Result of a health-check probe against the backend API. */
export interface ApiHealthProbeResult {
  ok: boolean;
  status: number;
  payload: Record<string, unknown> | null;
}

/**
 * Probes the backend health endpoint with an abort-controlled timeout.
 * @param baseUrl - Backend base URL to probe.
 * @param timeoutMs - Maximum wait time in milliseconds (defaults to 7000).
 * @returns An {@link ApiHealthProbeResult} with status and parsed JSON payload.
 */
export const probeApiHealth = async (
  baseUrl: string,
  timeoutMs = 7000,
): Promise<ApiHealthProbeResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildHealthUrl(baseUrl), {
      method: 'GET',
      signal: controller.signal,
    });

    const payload = (await response
      .json()
      .catch(() => null)) as Record<string, unknown> | null;

    return {
      ok: response.ok,
      status: response.status,
      payload,
    };
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Builds a full auth endpoint path, prepending the auth base path when needed.
 * @param path - Relative auth path or absolute URL.
 * @returns Fully qualified auth endpoint path.
 */
export const buildAuthUrl = (path: string): string => {
  if (path.startsWith('http')) {
    return path;
  }

  if (path.startsWith(`${API_PREFIX}/`)) {
    return path;
  }

  return `${AUTH_BASE_PATH}${ensureLeadingSlash(path)}`;
};

/** Map of auth-related endpoint path segments. */
export const AUTH_ENDPOINTS = {
  login: '/login',
  register: '/register',
  logout: '/logout',
  refresh: '/refresh',
  me: '/me',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
} as const;
