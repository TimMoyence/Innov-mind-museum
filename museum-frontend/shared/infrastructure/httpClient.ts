import axios from 'axios';
import Constants from 'expo-constants';

import { getAccessToken } from '@/services/tokenStore';
import { createAppError } from '@/shared/types/AppError';

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export const setUnauthorizedHandler = (
  handler: UnauthorizedHandler | null,
): void => {
  unauthorizedHandler = handler;
};

type HttpRequestConfig = {
  requiresAuth?: boolean;
  _retryCount?: number;
} & Record<string, unknown>;

const resolveBaseUrl = (): string => {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  const fromExpoExtra = (
    Constants?.expoConfig as { extra?: Record<string, unknown> } | undefined
  )?.extra?.API_BASE_URL;

  const candidate = (fromEnv || fromExpoExtra) as string | undefined;

  return candidate?.trim?.() || 'http://localhost:3000';
};

const DEFAULT_BASE_URL = resolveBaseUrl();
let runtimeBaseUrl = DEFAULT_BASE_URL;

export const setApiBaseUrl = (nextUrl: string): void => {
  const normalized = nextUrl?.trim?.();
  runtimeBaseUrl = normalized || DEFAULT_BASE_URL;
};

export const getApiBaseUrl = (): string => runtimeBaseUrl;

export const API_BASE_URL = DEFAULT_BASE_URL;

const httpClient = axios.create({
  headers: {
    Accept: 'application/json',
  },
  withCredentials: true,
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

  if (status === 401) {
    try {
      unauthorizedHandler?.();
    } catch (_error) {
      // preserve original error mapping
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
      try {
        unauthorizedHandler?.();
      } catch (_error) {
        // preserve original error mapping
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

export { httpClient };
