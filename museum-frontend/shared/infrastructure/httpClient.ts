import axios from 'axios';

import {
  assertApiBaseUrlAllowed,
  tryResolveInitialApiBaseUrl,
} from './apiConfig';
import { reportError } from '@/shared/observability/errorReporting';
import { generateRequestId } from './requestId';
import { mapAxiosError, toAxiosLikeError } from './httpErrorMapper';

type UnauthorizedHandler = () => void;
type AuthRefreshHandler = () => Promise<string | null>;
type TokenProvider = () => string | null;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let authRefreshHandler: AuthRefreshHandler | null = null;
let authRefreshInFlight: Promise<string | null> | null = null;
let tokenProvider: TokenProvider | null = null;

/**
 * Registers a provider function that returns the current access token.
 * @param fn - Function returning the token string (or `null`), or `null` to unregister.
 */
export const setTokenProvider = (fn: TokenProvider | null): void => {
  tokenProvider = fn;
};

/**
 * Registers a callback invoked when a 401 response is received on an authenticated request.
 * @param handler - Handler function, or `null` to unregister.
 */
export const setUnauthorizedHandler = (
  handler: UnauthorizedHandler | null,
): void => {
  unauthorizedHandler = handler;
};

/**
 * Registers a handler that attempts to refresh the access token on 401 responses.
 * @param handler - Async function returning a new access token (or `null` on failure), or `null` to unregister.
 */
export const setAuthRefreshHandler = (
  handler: AuthRefreshHandler | null,
): void => {
  authRefreshHandler = handler;
};

type HttpRequestConfig = {
  requiresAuth?: boolean;
  _retryCount?: number;
  _retriedAfterAuthRefresh?: boolean;
} & Record<string, unknown>;

const initialApiBaseUrlResolution = tryResolveInitialApiBaseUrl();
if (initialApiBaseUrlResolution.error && __DEV__) {
   
  console.warn(
    '[HTTP] Invalid API base URL configuration',
    initialApiBaseUrlResolution.error,
  );
}

const DEFAULT_BASE_URL = initialApiBaseUrlResolution.url;
let runtimeBaseUrl = DEFAULT_BASE_URL;

/**
 * Updates the runtime API base URL used by all subsequent HTTP requests.
 * @param nextUrl - New base URL; falls back to the default when empty.
 * @throws When the URL targets localhost in a non-development build.
 */
export const setApiBaseUrl = (nextUrl: string): void => {
  const normalized = nextUrl.trim() || DEFAULT_BASE_URL;
  assertApiBaseUrlAllowed(normalized);
  runtimeBaseUrl = normalized;
};

/** Returns the current runtime API base URL. */
export const getApiBaseUrl = (): string => runtimeBaseUrl;

let runtimeLocale = 'en';

/**
 * Updates the locale sent via Accept-Language on all subsequent requests.
 * @param locale - Language code (e.g. "fr", "en").
 */
export const setLocale = (locale: string): void => {
  runtimeLocale = locale || 'en';
};

/** Returns the current runtime locale used for Accept-Language. */
export const getLocale = (): string => runtimeLocale;

const httpClient = axios.create({
  headers: {
    Accept: 'application/json',
  },
  timeout: 15000,
});

const wait = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

httpClient.interceptors.request.use((config) => {
  const finalConfig = config as typeof config & HttpRequestConfig;
  finalConfig.baseURL = getApiBaseUrl();

  const requestId = generateRequestId();
  finalConfig.headers = {
    ...finalConfig.headers,
    'Accept-Language': getLocale(),
    'X-Request-Id': requestId,
  };

  const shouldAttachAuth = finalConfig.requiresAuth !== false;

  if (shouldAttachAuth) {
    const token = tokenProvider?.() ?? null;
    if (token && !finalConfig.headers.Authorization) {
      finalConfig.headers = {
        ...finalConfig.headers,
        Authorization: `Bearer ${token}`,
      };
    }
  }

  if (__DEV__) {
     
    console.debug(
      '[HTTP] ->',
      finalConfig.method?.toUpperCase(),
      finalConfig.baseURL,
      finalConfig.url,
      `[${requestId}]`,
    );
  }

  return finalConfig;
});

httpClient.interceptors.response.use(
  (response) => {
    if (__DEV__) {
       
      console.debug('[HTTP] <-', response.status, response.config.url);
    }
    return response;
  },
  async (error: unknown) => {
    const axiosError = toAxiosLikeError(error);
    const config = (axiosError?.config ?? {}) as HttpRequestConfig;
    const status = axiosError?.response?.status;

    const requestUrl = String(config.url ?? '');
    const isAuthRefreshRequest = requestUrl.includes('/api/auth/refresh');
    const isAuthRequired = config.requiresAuth !== false;

    if (
      status === 401 &&
      isAuthRequired &&
      !isAuthRefreshRequest &&
      !config._retriedAfterAuthRefresh &&
      authRefreshHandler &&
      axiosError?.config
    ) {
      try {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- multi-line promise guard, ??= less readable
        if (!authRefreshInFlight) {
          authRefreshInFlight = authRefreshHandler().finally(() => {
            authRefreshInFlight = null;
          });
        }

        const nextAccessToken = await authRefreshInFlight;
        if (nextAccessToken) {
          config._retriedAfterAuthRefresh = true;
          const headers = (axiosError.config.headers ?? {}) as Record<string, unknown>;
          axiosError.config.headers = {
            ...headers,
            Authorization: `Bearer ${nextAccessToken}`,
          };
          return await httpClient.request(axiosError.config as never);
        }
      } catch {
        // Fall through to standard error mapping / unauthorized handling.
      }
    }

    const is429 = status === 429;
    const retryable =
      !status || status >= 500 || axiosError.code === 'ECONNABORTED' || is429;
    const retryCount = config._retryCount ?? 0;
    const maxRetries = is429 ? 3 : 2;

    if (retryable && retryCount < maxRetries && axiosError?.config) {
      config._retryCount = retryCount + 1;

      let delayMs: number;
      if (is429) {
        // Respect Retry-After header when present, otherwise exponential backoff: 1s, 2s, 4s
        const responseHeaders = (
          axiosError.response as { headers?: Record<string, string> } | undefined
        )?.headers;
        const retryAfterValue =
          responseHeaders?.['retry-after'] ?? responseHeaders?.['Retry-After'];
        if (retryAfterValue) {
          const parsed = Number(retryAfterValue);
          delayMs =
            Number.isFinite(parsed) && parsed > 0
              ? parsed * 1000
              : 1000 * 2 ** retryCount;
        } else {
          delayMs = 1000 * 2 ** retryCount;
        }
      } else {
        delayMs = 150 * (retryCount + 1);
      }

      await wait(delayMs);
      return httpClient.request(axiosError.config as never);
    }

    const mapped = mapAxiosError(error);
    reportError(mapped);
    return Promise.reject(mapped);
  },
);

export { mapAxiosError };

/** Pre-configured Axios instance with auth, retry, and token-refresh interceptors. */
export { httpClient };
