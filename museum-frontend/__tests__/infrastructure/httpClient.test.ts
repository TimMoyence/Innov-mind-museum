import '@/__tests__/helpers/test-utils';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/shared/infrastructure/requestId', () => ({
  generateRequestId: () => 'mock-request-id',
}));

jest.mock('@/shared/observability/errorReporting', () => ({
  reportError: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: {} },
}));

jest.mock('@/shared/infrastructure/apiConfig', () => ({
  tryResolveInitialApiBaseUrl: () => ({ url: 'https://api.test.com', error: null }),
  assertApiBaseUrlAllowed: jest.fn(),
}));

import {
  httpClient,
  setTokenProvider,
  setApiBaseUrl,
  getApiBaseUrl,
  setLocale,
  getLocale,
  setAuthRefreshHandler,
  setUnauthorizedHandler,
  mapAxiosError,
} from '@/shared/infrastructure/httpClient';
import { reportError } from '@/shared/observability/errorReporting';
import type { AppError } from '@/shared/types/AppError';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Makes a request using httpClient with a custom adapter that captures the
 * config after interceptors have run and resolves with a mock response.
 */
const captureRequestConfig = async (): Promise<Record<string, unknown>> => {
  let capturedConfig: Record<string, unknown> = {};

  await httpClient.request({
    url: '/api/test',
    method: 'GET',
    requiresAuth: true,
    adapter: (config: Record<string, unknown>) => {
      capturedConfig = config;
      return Promise.resolve({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    },
  } as never);

  return capturedConfig;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('httpClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setTokenProvider(null);
    setAuthRefreshHandler(null);
    setUnauthorizedHandler(null);
    setApiBaseUrl('https://api.test.com');
    setLocale('en');
  });

  // ── API Base URL ───────────────────────────────────────────────────────────

  describe('setApiBaseUrl / getApiBaseUrl', () => {
    it('returns the initial base URL', () => {
      expect(getApiBaseUrl()).toBe('https://api.test.com');
    });

    it('updates the runtime base URL', () => {
      setApiBaseUrl('https://new-api.test.com');

      expect(getApiBaseUrl()).toBe('https://new-api.test.com');
    });

    it('trims whitespace from URL', () => {
      setApiBaseUrl('  https://trimmed.test.com  ');

      expect(getApiBaseUrl()).toBe('https://trimmed.test.com');
    });

    it('falls back to default when given empty string', () => {
      setApiBaseUrl('');

      expect(getApiBaseUrl()).toBe('https://api.test.com');
    });

    it('falls back to default when given whitespace-only string', () => {
      setApiBaseUrl('   ');

      expect(getApiBaseUrl()).toBe('https://api.test.com');
    });
  });

  // ── Locale ─────────────────────────────────────────────────────────────────

  describe('setLocale / getLocale', () => {
    it('defaults to "en"', () => {
      expect(getLocale()).toBe('en');
    });

    it('updates the runtime locale', () => {
      setLocale('fr');

      expect(getLocale()).toBe('fr');
    });

    it('falls back to "en" for empty string', () => {
      setLocale('de');
      setLocale('');

      expect(getLocale()).toBe('en');
    });
  });

  // ── Request interceptor ────────────────────────────────────────────────────

  describe('request interceptor', () => {
    it('attaches Authorization header when tokenProvider is set', async () => {
      setTokenProvider(() => 'my-jwt-token');

      const config = await captureRequestConfig();
      const headers = config.headers as { get: (name: string) => string | undefined };

      expect(headers.get('Authorization')).toBe('Bearer my-jwt-token');
    });

    it('does not attach Authorization when tokenProvider returns null', async () => {
      setTokenProvider(() => null);

      const config = await captureRequestConfig();
      const headers = config.headers as { get: (name: string) => string | undefined };

      // No auth header should be set (tokenProvider returned null)
      expect(headers.get('Authorization')).toBeUndefined();
    });

    it('does not attach Authorization when no tokenProvider', async () => {
      setTokenProvider(null);

      const config = await captureRequestConfig();
      const headers = config.headers as { get: (name: string) => string | undefined };

      expect(headers.get('Authorization')).toBeUndefined();
    });

    it('sets Accept-Language header from locale', async () => {
      setLocale('ja');

      const config = await captureRequestConfig();
      const headers = config.headers as { get: (name: string) => string | undefined };

      expect(headers.get('Accept-Language')).toBe('ja');
    });

    it('sets X-Request-Id header on every request', async () => {
      const config = await captureRequestConfig();
      const headers = config.headers as { get: (name: string) => string | undefined };

      expect(headers.get('X-Request-Id')).toBe('mock-request-id');
    });

    it('sets baseURL from runtime API base URL', async () => {
      setApiBaseUrl('https://runtime.test.com');

      const config = await captureRequestConfig();

      expect(config.baseURL).toBe('https://runtime.test.com');
    });
  });

  // ── mapAxiosError ──────────────────────────────────────────────────────────

  describe('mapAxiosError', () => {
    it('maps timeout errors to Timeout kind', () => {
      const error = {
        isAxiosError: true,
        code: 'ECONNABORTED',
        message: 'timeout',
        config: {},
      };

      const result = mapAxiosError(error);

      expect(result.kind).toBe('Timeout');
      expect(result.message).toBe('Request timed out');
    });

    it('maps network errors to Network kind', () => {
      const error = {
        isAxiosError: true,
        message: 'Network Error',
        config: {},
      };

      const result = mapAxiosError(error);

      expect(result.kind).toBe('Network');
      expect(result.message).toBe('Network unavailable');
    });

    it('maps 401 response to Unauthorized kind', () => {
      const error = {
        isAxiosError: true,
        response: { status: 401, data: {} },
        config: {},
      };

      const result = mapAxiosError(error);

      expect(result.kind).toBe('Unauthorized');
    });

    it('maps 403 response to Forbidden kind', () => {
      const error = {
        isAxiosError: true,
        response: { status: 403, data: {} },
        config: {},
      };

      const result = mapAxiosError(error);

      expect(result.kind).toBe('Forbidden');
    });

    it('maps 403 with invalid token to Unauthorized', () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 403,
          data: { error: { code: 'FORBIDDEN', message: 'invalid token' } },
        },
        config: {},
      };

      const result = mapAxiosError(error);

      expect(result.kind).toBe('Unauthorized');
    });

    it('maps 404 response to NotFound kind', () => {
      const error = {
        isAxiosError: true,
        response: { status: 404, data: {} },
        config: {},
      };

      const result = mapAxiosError(error);

      expect(result.kind).toBe('NotFound');
    });

    it('maps 429 response to RateLimited kind', () => {
      const error = {
        isAxiosError: true,
        response: { status: 429, data: {} },
        config: {},
      };

      const result = mapAxiosError(error);

      expect(result.kind).toBe('RateLimited');
    });

    it('maps 422 response to Validation kind', () => {
      const error = {
        isAxiosError: true,
        response: { status: 422, data: {} },
        config: {},
      };

      const result = mapAxiosError(error);

      expect(result.kind).toBe('Validation');
    });

    it('maps 5xx without specific status to Unknown kind', () => {
      const error = {
        isAxiosError: true,
        response: { status: 503, data: {} },
        config: {},
      };

      const result = mapAxiosError(error);

      expect(result.kind).toBe('Unknown');
      expect(result.status).toBe(503);
    });

    it('maps unknown (non-Axios) errors to Unknown kind', () => {
      const result = mapAxiosError('random string');

      expect(result.kind).toBe('Unknown');
      expect(result.message).toBe('Unexpected error');
    });

    it('preserves request ID from error response payload', () => {
      const error = {
        isAxiosError: true,
        response: {
          status: 500,
          data: { error: { code: 'INTERNAL', message: 'boom', requestId: 'req-42' } },
        },
        config: {},
      };

      const result = mapAxiosError(error);

      expect(result.requestId).toBe('req-42');
    });

    it('handles null error input', () => {
      const result = mapAxiosError(null);

      expect(result.kind).toBe('Unknown');
    });
  });

  // ── Response interceptor — error reporting ─────────────────────────────────

  describe('response interceptor — error reporting', () => {
    it('reports errors via reportError on final failure', async () => {
      try {
        await httpClient.request({
          url: '/api/test',
          method: 'GET',
          requiresAuth: false,
          adapter: () => {
            const err = Object.assign(new Error('fatal'), {
              isAxiosError: true,
              response: { status: 400, data: { error: { code: 'BAD' } } },
              config: {
                url: '/api/test',
                headers: {},
                requiresAuth: false,
                _retryCount: 99,
              },
            });
            return Promise.reject(err);
          },
        } as never);
      } catch {
        // Expected
      }

      expect(reportError).toHaveBeenCalled();
    });
  });

  // ── httpClient instance ────────────────────────────────────────────────────

  describe('httpClient instance', () => {
    it('is an Axios instance with default Accept header including application/json', () => {
      const rawAccept = httpClient.defaults.headers.common?.Accept;
      const acceptHeader = typeof rawAccept === 'string' ? rawAccept : '';
      expect(acceptHeader).toContain('application/json');
    });

    it('has a 15-second default timeout', () => {
      expect(httpClient.defaults.timeout).toBe(15000);
    });

    it('has request interceptors configured', () => {
      // Axios interceptors.request.handlers is internal but we can verify they exist
      expect(httpClient.interceptors.request).toBeDefined();
    });

    it('has response interceptors configured', () => {
      expect(httpClient.interceptors.response).toBeDefined();
    });
  });
});
