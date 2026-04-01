import { createAppError } from '../types/AppError';
import type { AppError } from '../types/AppError';

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
    requestId?: unknown;
  };
  code?: unknown;
  message?: unknown;
}

type HttpRequestConfig = {
  requiresAuth?: boolean;
} & Record<string, unknown>;

export const toAxiosLikeError = (error: unknown): AxiosLikeError | null => {
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

export const toApiErrorPayload = (value: unknown): ApiErrorPayload | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return value as ApiErrorPayload;
};

export const getApiErrorCode = (value: unknown): string | undefined => {
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

export const getApiErrorMessage = (value: unknown): string | undefined => {
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

export const getApiRequestId = (value: unknown): string | undefined => {
  const payload = toApiErrorPayload(value);
  if (!payload) {
    return undefined;
  }

  const nested = payload.error;
  if (nested && typeof nested.requestId === 'string') {
    return nested.requestId;
  }

  return undefined;
};

/**
 * Converts an Axios error (or unknown thrown value) into a structured {@link AppError}.
 * Handles timeout, network, 401, 403, 404, and 4xx/5xx status codes.
 * @param error - The caught error value.
 * @returns An `AppError & Error` with the appropriate kind and message.
 */
export const mapAxiosError = (error: unknown): AppError & Error => {
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
  const apiErrorMessage = (getApiErrorMessage(responseData) ?? '').toLowerCase();
  const _requestRequiresAuth =
    ((axiosLike.config ?? {}) as HttpRequestConfig).requiresAuth !== false;
  const requestId = getApiRequestId(responseData);

  if (status === 401) {
    return createAppError({
      kind: 'Unauthorized',
      message: 'Authentication required',
      status,
      details: axiosLike.response?.data,
      requestId,
    });
  }

  if (status === 403) {
    if (apiErrorCode === 'FORBIDDEN' && apiErrorMessage.includes('invalid token')) {
      return createAppError({
        kind: 'Unauthorized',
        message: 'Authentication required',
        status,
        details: responseData,
        requestId,
      });
    }

    return createAppError({
      kind: 'Forbidden',
      message: 'Access denied',
      status,
      details: responseData,
      requestId,
    });
  }

  if (status === 404) {
    return createAppError({
      kind: 'NotFound',
      message: 'Resource not found',
      status,
      details: axiosLike.response?.data,
      requestId,
    });
  }

  if (status === 429) {
    return createAppError({
      kind: 'RateLimited',
      message: 'Too many requests',
      status,
      details: axiosLike.response?.data,
      requestId,
    });
  }

  if (status && status >= 400 && status < 500) {
    return createAppError({
      kind: 'Validation',
      message: 'Request validation error',
      status,
      details: axiosLike.response?.data,
      requestId,
    });
  }

  return createAppError({
    kind: 'Unknown',
    message: 'Unexpected server error',
    status,
    details: axiosLike.response?.data ?? axiosLike,
    requestId,
  });
};
