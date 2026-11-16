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
    requestId?: unknown;
  };
  code?: unknown;
}

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
  const nested = payload?.error?.code;
  if (typeof nested === 'string') return nested;
  const flat = payload?.code;
  return typeof flat === 'string' ? flat : undefined;
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
  const requestId = getApiRequestId(responseData);

  if (status === 401) {
    return createAppError({
      kind: 'Unauthorized',
      message: 'Authentication required',
      code: apiErrorCode,
      status,
      details: axiosLike.response?.data,
      requestId,
    });
  }

  if (status === 403) {
    return createAppError({
      kind: 'Forbidden',
      message: 'Access denied',
      code: apiErrorCode,
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
    if (apiErrorCode === 'DAILY_LIMIT_REACHED') {
      return createAppError({
        kind: 'DailyLimitReached',
        message: 'Daily chat limit reached',
        status,
        details: axiosLike.response?.data,
        requestId,
      });
    }

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
      code: apiErrorCode,
      status,
      details: axiosLike.response?.data,
      requestId,
    });
  }

  return createAppError({
    kind: 'Unknown',
    message: 'Unexpected server error',
    code: apiErrorCode,
    status,
    details: axiosLike.response?.data ?? axiosLike,
    requestId,
  });
};
