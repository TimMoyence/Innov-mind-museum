import Constants from 'expo-constants';

export type ApiEnvironment = 'staging' | 'production' | 'custom';

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

const resolveBuildVariant = (): 'development' | 'preview' | 'production' => {
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
  fallback: string;
  staging?: string;
  production?: string;
} => {
  const extra = readExtra();
  const fallback =
    trimOrUndefined(process.env.EXPO_PUBLIC_API_BASE_URL) ||
    trimOrUndefined(extra.API_BASE_URL) ||
    'http://localhost:3000';

  const staging =
    trimOrUndefined(process.env.EXPO_PUBLIC_API_BASE_URL_STAGING) ||
    trimOrUndefined(extra.API_BASE_URL_STAGING);

  const production =
    trimOrUndefined(process.env.EXPO_PUBLIC_API_BASE_URL_PROD) ||
    trimOrUndefined(extra.API_BASE_URL_PRODUCTION);

  return {
    fallback: normalizeBaseUrl(fallback),
    staging: staging ? normalizeBaseUrl(staging) : undefined,
    production: production ? normalizeBaseUrl(production) : undefined,
  };
};

const localhostPattern =
  /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|::1)$/i;

export const isLocalhostApiBaseUrl = (value: string): boolean => {
  try {
    const hostname = new URL(value).hostname;
    return localhostPattern.test(hostname);
  } catch {
    return value.includes('localhost') || value.includes('127.0.0.1');
  }
};

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
    return configured.production || configured.fallback;
  }

  return configured.staging || configured.fallback;
};

export const assertApiBaseUrlAllowed = (value: string): void => {
  const variant = resolveBuildVariant();
  if (variant !== 'development' && isLocalhostApiBaseUrl(value)) {
    throw new Error(
      'Localhost backend URL is blocked for preview/production builds. Configure staging or production API URL.',
    );
  }
};

export const resolveInitialApiBaseUrl = (): string => {
  const url = resolveRuntimeApiBaseUrl(getDefaultApiEnvironment());
  assertApiBaseUrlAllowed(url);
  return url;
};

const API_PREFIX = '/api';
const AUTH_BASE_PATH = `${API_PREFIX}/auth`;
const HEALTH_PATH = `${API_PREFIX}/health`;

export const buildApiUrl = (baseUrl: string, path: string): string => {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  return `${normalizedBase}${ensureLeadingSlash(path)}`;
};

export const buildHealthUrl = (baseUrl: string): string => {
  return buildApiUrl(baseUrl, HEALTH_PATH);
};

export interface ApiHealthProbeResult {
  ok: boolean;
  status: number;
  payload: Record<string, unknown> | null;
}

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

export const buildAuthUrl = (path: string): string => {
  if (path.startsWith('http')) {
    return path;
  }

  if (path.startsWith(`${API_PREFIX}/`)) {
    return path;
  }

  return `${AUTH_BASE_PATH}${ensureLeadingSlash(path)}`;
};

export const AUTH_ENDPOINTS = {
  login: '/login',
  register: '/register',
  logout: '/logout',
  refresh: '/refresh',
  me: '/me',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
} as const;
