import axios from 'axios';

import { getAccessToken } from '@/services/tokenStore';
import {
  assertApiBaseUrlAllowed,
  tryResolveInitialApiBaseUrl,
} from '@/services/apiConfig';
import { createAppError } from '@/shared/types/AppError';

type UnauthorizedHandler = () => void;
type AuthRefreshHandler = () => Promise<string | null>;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let authRefreshHandler: AuthRefreshHandler | null = null;
let authRefreshInFlight: Promise<string | null> | null = null;

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
  // eslint-disable-next-line no-console
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
  const normalized = nextUrl?.trim?.() || DEFAULT_BASE_URL;
  assertApiBaseUrlAllowed(normalized);
  runtimeBaseUrl = normalized;
};

/** Returns the current runtime API base URL. */
export const getApiBaseUrl = (): string => runtimeBaseUrl;

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

  const shouldAttachAuth = finalConfig.requiresAuth !== false;

  if (shouldAttachAuth) {
    const token = getAccessToken();
    if (token && !finalConfig.headers?.Authorization) {
      finalConfig.headers = {
        ...finalConfig.headers,
        Authorization: `Bearer ${token}`,
      };
    }
  }

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.debug(
      '[HTTP] ->',
      finalConfig.method?.toUpperCase(),
      finalConfig.baseURL,
      finalConfig.url,
    );
  }

  return finalConfig;
});

httpClient.interceptors.response.use(
  (response) => {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.debug('[HTTP] <-', response.status, response.config.url);
    }
    return response;
  },
  async (error: unknown) => {
    const axiosError = toAxiosLikeError(error);
    const config = (axiosError?.config || {}) as HttpRequestConfig;
    const status = axiosError?.response?.status;

    const requestUrl = String(config.url || '');
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
        if (!authRefreshInFlight) {
          authRefreshInFlight = authRefreshHandler().finally(() => {
            authRefreshInFlight = null;
          });
        }

        const nextAccessToken = await authRefreshInFlight;
        if (nextAccessToken) {
          config._retriedAfterAuthRefresh = true;
          const headers = (axiosError.config.headers || {}) as Record<string, unknown>;
          axiosError.config.headers = {
            ...headers,
            Authorization: `Bearer ${nextAccessToken}`,
          };
          return httpClient.request(axiosError.config as never);
        }
      } catch {
        // Fall through to standard error mapping / unauthorized handling.
      }
    }

    const retryable =
      !status || status >= 500 || axiosError?.code === 'ECONNABORTED';
    const retryCount = config._retryCount || 0;

    if (retryable && retryCount < 2 && axiosError?.config) {
      config._retryCount = retryCount + 1;
      await wait(150 * (retryCount + 1));
      return httpClient.request(axiosError.config as never);
    }

    return Promise.reject(mapAxiosError(error));
  },
);

interface AxiosLikeError {
  isAxiosError?: boolean;
  code?: string;
  message?: string;
  response?: {
    status?: number;
    data?: unknown;
  };
  config?: Record<string, unknown>;
}

interface ApiErrorPayload {
  error?: {
    code?: unknown;
    message?: unknown;
  };
  code?: unknown;
  message?: unknown;
}

const toAxiosLikeError = (error: unknown): AxiosLikeError | null => {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = error as AxiosLikeError;
  if (
    candidate.isAxiosError ||
    'response' in candidate ||
    'config' in candidate ||
    'code' in candidate
  ) {
    return candidate;
  }

  return null;
};

const toApiErrorPayload = (value: unknown): ApiErrorPayload | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return value as ApiErrorPayload;
};

const getApiErrorCode = (value: unknown): string | undefined => {
  const payload = toApiErrorPayload(value);
  if (!payload) {
    return undefined;
  }

  if (typeof payload.error?.code === 'string') {
    return payload.error.code;
  }

  if (typeof payload.code === 'string') {
    return payload.code;
  }

  return undefined;
};

const getApiErrorMessage = (value: unknown): string | undefined => {
  const payload = toApiErrorPayload(value);
  if (!payload) {
    return undefined;
  }

  if (typeof payload.error?.message === 'string') {
    return payload.error.message;
  }

  if (typeof payload.message === 'string') {
    return payload.message;
  }

  return undefined;
};

/**
 * Converts an Axios error (or unknown thrown value) into a structured {@link AppError}.
 * Handles timeout, network, 401, 403, 404, and 4xx/5xx status codes.
 * @param error - The caught error value.
 * @returns An `AppError & Error` with the appropriate kind and message.
 */
export const mapAxiosError = (error: unknown) => {
  const axiosLike = toAxiosLikeError(error);

  if (!axiosLike) {
    return createAppError({
      kind: 'Unknown',
      message: 'Unexpected error',
      details: error,
    });
  }

  if (axiosLike.code === 'ECONNABORTED') {
    return createAppError({
      kind: 'Timeout',
      message: 'Request timed out',
      details: axiosLike,
    });
  }

  if (axiosLike.message === 'Network Error') {
    return createAppError({
      kind: 'Network',
      message: 'Network unavailable',
      details: axiosLike,
    });
  }

  const status = axiosLike.response?.status;
  const responseData = axiosLike.response?.data;
  const apiErrorCode = getApiErrorCode(responseData);
  const apiErrorMessage = (getApiErrorMessage(responseData) || '').toLowerCase();
  const requestRequiresAuth =
    ((axiosLike.config || {}) as HttpRequestConfig).requiresAuth !== false;

  if (status === 401) {
    if (requestRequiresAuth) {
      try {
        unauthorizedHandler?.();
      } catch (_error) {
        // preserve original error mapping
      }
    }
    return createAppError({
      kind: 'Unauthorized',
      message: 'Authentication required',
      status,
      details: axiosLike.response?.data,
    });
  }

  if (status === 403) {
    if (
      apiErrorCode === 'FORBIDDEN' &&
      apiErrorMessage.includes('invalid token')
    ) {
      if (requestRequiresAuth) {
        try {
          unauthorizedHandler?.();
        } catch (_error) {
          // preserve original error mapping
        }
      }
      return createAppError({
        kind: 'Unauthorized',
        message: 'Authentication required',
        status,
        details: responseData,
      });
    }

    return createAppError({
      kind: 'Forbidden',
      message: 'Access denied',
      status,
      details: responseData,
    });
  }

  if (status === 404) {
    return createAppError({
      kind: 'NotFound',
      message: 'Resource not found',
      status,
      details: axiosLike.response?.data,
    });
  }

  if (status && status >= 400 && status < 500) {
    return createAppError({
      kind: 'Validation',
      message: 'Request validation error',
      status,
      details: axiosLike.response?.data,
    });
  }

  return createAppError({
    kind: 'Unknown',
    message: 'Unexpected server error',
    status,
    details: axiosLike.response?.data ?? axiosLike,
  });
};

/** Pre-configured Axios instance with auth, retry, and token-refresh interceptors. */
export { httpClient };
