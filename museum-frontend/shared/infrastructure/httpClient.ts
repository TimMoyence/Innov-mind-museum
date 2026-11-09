import axios, { type AxiosRequestConfig } from 'axios';
import * as Sentry from '@sentry/react-native';

import type { components } from '@/shared/api/generated/openapi';
import type { QuotaInfo } from '@/shared/types/quota-info';

import { resolveInitialApiBaseUrl } from './apiConfig';
import { reportError } from '@/shared/observability/errorReporting';
import { generateRequestId } from './requestId';
import { getApiErrorCode, mapAxiosError, toAxiosLikeError } from './httpErrorMapper';
import { getCurrentDataMode } from './dataMode/currentDataMode';
import { recordHttpQualitySample } from './connectivity/qualitySampling';

type UnauthorizedHandler = () => void;

export type AuthRefreshResult =
  | { kind: 'success'; accessToken: string }
  | { kind: 'invalid' }
  | { kind: 'transient' };

type AuthRefreshHandler = () => Promise<AuthRefreshResult>;
type TokenProvider = () => string | null;

type PaywallHandler = (info: QuotaInfo) => void;

type QuotaExceededError = components['schemas']['QuotaExceededError'];

let unauthorizedHandler: UnauthorizedHandler | null = null;
let authRefreshHandler: AuthRefreshHandler | null = null;
let inflightRefresh: Promise<AuthRefreshResult> | null = null;
let tokenProvider: TokenProvider | null = null;
let paywallHandler: PaywallHandler | null = null;

export const setTokenProvider = (fn: TokenProvider | null): void => {
  tokenProvider = fn;
};

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null): void => {
  unauthorizedHandler = handler;
};

export const setPaywallHandler = (handler: PaywallHandler | null): void => {
  paywallHandler = handler;
};

export const setAuthRefreshHandler = (handler: AuthRefreshHandler | null): void => {
  authRefreshHandler = handler;
};

export const runAuthRefresh = async (): Promise<AuthRefreshResult> => {
  if (!authRefreshHandler) {
    return { kind: 'transient' };
  }
  if (inflightRefresh) {
    return inflightRefresh;
  }

  const handler = authRefreshHandler;
  const cycle = (async (): Promise<AuthRefreshResult> => {
    let result: AuthRefreshResult;
    try {
      result = await handler();
    } catch {
      result = { kind: 'transient' };
    }
    if (result.kind === 'invalid') {
      try {
        unauthorizedHandler?.();
      } catch {}
    }
    return result;
  })();

  inflightRefresh = cycle.finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
};

type HttpRequestConfig = {
  requiresAuth?: boolean;
  _retryCount?: number;
  _retriedAfterAuthRefresh?: boolean;
  _startedAt?: number;
  skipQualitySample?: boolean;
} & Record<string, unknown>;

const API_BASE_URL = resolveInitialApiBaseUrl();

let runtimeLocale = 'en';

export const setLocale = (locale: string): void => {
  runtimeLocale = locale || 'en';
};

export const getLocale = (): string => runtimeLocale;

const httpClient = axios.create({
  headers: {
    Accept: 'application/json',
  },
  timeout: 15000,
  maxContentLength: 10 * 1024 * 1024,
  maxBodyLength: 10 * 1024 * 1024,
});

const requestUrlOf = (url: unknown): string => (typeof url === 'string' ? url : '');

const wait = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

httpClient.interceptors.request.use((config) => {
  const finalConfig = config as typeof config & HttpRequestConfig;
  finalConfig.baseURL = API_BASE_URL;
  finalConfig._startedAt = Date.now();

  const requestId = generateRequestId();
  finalConfig.headers.set('Accept-Language', getLocale());
  finalConfig.headers.set('X-Request-Id', requestId);

  if (!finalConfig.headers.get('X-Data-Mode')) {
    finalConfig.headers.set('X-Data-Mode', getCurrentDataMode());
  }

  const shouldAttachAuth = finalConfig.requiresAuth !== false;

  if (shouldAttachAuth) {
    const token = tokenProvider?.() ?? null;
    if (token && !finalConfig.headers.get('Authorization')) {
      finalConfig.headers.set('Authorization', `Bearer ${token}`);
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

const emitHttpBreadcrumb = (
  config: HttpRequestConfig,
  status: number | undefined,
  level: 'info' | 'warning' | 'error',
): void => {
  try {
    if (!Sentry.getClient()) return;
    const startedAt = typeof config._startedAt === 'number' ? config._startedAt : undefined;
    const durationMs = startedAt ? Date.now() - startedAt : undefined;
    Sentry.addBreadcrumb({
      category: 'http',
      level,
      type: 'http',
      data: {
        method: typeof config.method === 'string' ? config.method.toUpperCase() : 'GET',
        url: requestUrlOf(config.url),
        status_code: status,
        duration_ms: durationMs,
      },
    });
  } catch {}
};

httpClient.interceptors.response.use(
  (response) => {
    if (__DEV__) {
      console.debug('[HTTP] <-', response.status, response.config.url);
    }
    emitHttpBreadcrumb(
      response.config as typeof response.config & HttpRequestConfig,
      response.status,
      'info',
    );
    recordHttpQualitySample(response.config as typeof response.config & HttpRequestConfig, {
      ok: true,
      timedOut: false,
    });
    return response;
  },
  async (error: unknown) => {
    const axiosError = toAxiosLikeError(error);
    const config = (axiosError?.config ?? {}) as HttpRequestConfig;
    const status = axiosError?.response?.status;

    recordHttpQualitySample(
      config,
      axiosError?.response
        ? { ok: true, timedOut: false }
        : { ok: false, timedOut: axiosError?.code === 'ECONNABORTED' },
    );

    const requestUrl = requestUrlOf(config.url);
    const isAuthRefreshRequest = requestUrl.includes('/api/auth/refresh');
    const isAuthRequired = config.requiresAuth !== false;

    if (status === 402) {
      const body = axiosError?.response?.data as Partial<QuotaExceededError> | undefined;
      if (body?.code === 'QUOTA_EXCEEDED' && paywallHandler) {
        paywallHandler({
          tier: body.tier ?? 'free',
          currentCount: body.currentCount ?? 0,
          limit: body.limit ?? 0,
          resetAt: body.resetAt ?? '',
        });
      }
    }

    if (
      status === 401 &&
      isAuthRequired &&
      !isAuthRefreshRequest &&
      !config._retriedAfterAuthRefresh &&
      authRefreshHandler &&
      axiosError?.config
    ) {
      const refreshResult = await runAuthRefresh();
      if (refreshResult.kind === 'success') {
        config._retriedAfterAuthRefresh = true;
        const headers = (axiosError.config.headers ?? {}) as Record<string, unknown>;
        axiosError.config.headers = {
          ...headers,
          Authorization: `Bearer ${refreshResult.accessToken}`,
        };
        return await httpClient.request(axiosError.config as AxiosRequestConfig);
      }
    }

    const is429 = status === 429;
    const isDailyLimit =
      is429 && getApiErrorCode(axiosError?.response?.data) === 'DAILY_LIMIT_REACHED';
    const retryable =
      !isDailyLimit && (!status || status >= 500 || axiosError.code === 'ECONNABORTED' || is429);
    const retryCount = config._retryCount ?? 0;
    const maxRetries = is429 ? 3 : 2;

    if (retryable && retryCount < maxRetries && axiosError?.config) {
      config._retryCount = retryCount + 1;

      let delayMs: number;
      if (is429) {
        const responseHeaders = (
          axiosError.response as { headers?: Record<string, string> } | undefined
        )?.headers;
        const retryAfterValue =
          responseHeaders?.['retry-after'] ?? responseHeaders?.['Retry-After'];
        if (retryAfterValue) {
          const parsed = Number(retryAfterValue);
          delayMs = Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 1000 * 2 ** retryCount;
        } else {
          delayMs = 1000 * 2 ** retryCount;
        }
      } else {
        delayMs = 150 * (retryCount + 1);
      }

      await wait(delayMs);
      return httpClient.request(axiosError.config as AxiosRequestConfig);
    }

    const mapped = mapAxiosError(error);
    emitHttpBreadcrumb(config, status, status && status >= 500 ? 'error' : 'warning');
    reportError(mapped);
    return Promise.reject(mapped);
  },
);

export { mapAxiosError };

export { httpClient };
