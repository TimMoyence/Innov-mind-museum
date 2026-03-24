import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapAxiosError,
  toAxiosLikeError,
  getApiErrorCode,
  getApiErrorMessage,
  getApiRequestId,
} from '../shared/infrastructure/httpErrorMapper';

describe('mapAxiosError', () => {
  it('null input returns AppError kind=Unknown', () => {
    const result = mapAxiosError(null);
    assert.equal(result.kind, 'Unknown');
    assert.equal(result.message, 'Unexpected error');
  });

  it('undefined input returns AppError kind=Unknown', () => {
    const result = mapAxiosError(undefined);
    assert.equal(result.kind, 'Unknown');
    assert.equal(result.message, 'Unexpected error');
  });

  it('ECONNABORTED code returns Timeout', () => {
    const result = mapAxiosError({ code: 'ECONNABORTED', message: 'timeout' });
    assert.equal(result.kind, 'Timeout');
    assert.equal(result.message, 'Request timed out');
  });

  it('Network Error message returns Network', () => {
    const result = mapAxiosError({ message: 'Network Error', isAxiosError: true });
    assert.equal(result.kind, 'Network');
    assert.equal(result.message, 'Network unavailable');
  });

  it('response.status 401 returns Unauthorized', () => {
    const result = mapAxiosError({
      isAxiosError: true,
      response: { status: 401, data: {} },
      config: {},
    });
    assert.equal(result.kind, 'Unauthorized');
    assert.equal(result.message, 'Authentication required');
    assert.equal(result.status, 401);
  });

  it('response.status 403 with FORBIDDEN code and "invalid token" message returns Unauthorized', () => {
    const result = mapAxiosError({
      isAxiosError: true,
      response: {
        status: 403,
        data: {
          error: {
            code: 'FORBIDDEN',
            message: 'Invalid token provided',
          },
        },
      },
      config: {},
    });
    assert.equal(result.kind, 'Unauthorized');
    assert.equal(result.message, 'Authentication required');
    assert.equal(result.status, 403);
  });

  it('response.status 403 without FORBIDDEN/invalid token returns Forbidden', () => {
    const result = mapAxiosError({
      isAxiosError: true,
      response: {
        status: 403,
        data: { error: { code: 'OTHER', message: 'Not allowed' } },
      },
      config: {},
    });
    assert.equal(result.kind, 'Forbidden');
    assert.equal(result.message, 'Access denied');
    assert.equal(result.status, 403);
  });

  it('response.status 404 returns NotFound', () => {
    const result = mapAxiosError({
      isAxiosError: true,
      response: { status: 404, data: {} },
      config: {},
    });
    assert.equal(result.kind, 'NotFound');
    assert.equal(result.message, 'Resource not found');
    assert.equal(result.status, 404);
  });

  it('response.status 429 returns RateLimited', () => {
    const result = mapAxiosError({
      isAxiosError: true,
      response: { status: 429, data: {} },
      config: {},
    });
    assert.equal(result.kind, 'RateLimited');
    assert.equal(result.message, 'Too many requests');
    assert.equal(result.status, 429);
  });

  it('response.status 400-499 generic returns Validation', () => {
    const result = mapAxiosError({
      isAxiosError: true,
      response: { status: 422, data: {} },
      config: {},
    });
    assert.equal(result.kind, 'Validation');
    assert.equal(result.message, 'Request validation error');
    assert.equal(result.status, 422);
  });

  it('response.status 500+ returns Unknown', () => {
    const result = mapAxiosError({
      isAxiosError: true,
      response: { status: 502, data: { error: { message: 'Bad Gateway' } } },
      config: {},
    });
    assert.equal(result.kind, 'Unknown');
    assert.equal(result.message, 'Unexpected server error');
    assert.equal(result.status, 502);
  });

  it('extracts apiCode, apiMessage, requestId from response.data', () => {
    const result = mapAxiosError({
      isAxiosError: true,
      response: {
        status: 404,
        data: {
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found',
            requestId: 'req-abc-123',
          },
        },
      },
      config: {},
    });
    assert.equal(result.kind, 'NotFound');
    assert.equal(result.requestId, 'req-abc-123');
  });

  it('a plain object with no axios-like properties returns Unknown', () => {
    const result = mapAxiosError({ foo: 'bar' });
    assert.equal(result.kind, 'Unknown');
    assert.equal(result.message, 'Unexpected error');
  });

  it('a string error returns Unknown', () => {
    const result = mapAxiosError('something broke');
    assert.equal(result.kind, 'Unknown');
  });
});

describe('helper functions', () => {
  it('toAxiosLikeError returns null for non-objects', () => {
    assert.equal(toAxiosLikeError(null), null);
    assert.equal(toAxiosLikeError(42), null);
    assert.equal(toAxiosLikeError('str'), null);
  });

  it('toAxiosLikeError recognizes objects with response/config/code', () => {
    assert.ok(toAxiosLikeError({ response: {} }));
    assert.ok(toAxiosLikeError({ config: {} }));
    assert.ok(toAxiosLikeError({ code: 'ERR' }));
    assert.ok(toAxiosLikeError({ isAxiosError: true }));
  });

  it('getApiErrorCode extracts from nested error.code', () => {
    assert.equal(getApiErrorCode({ error: { code: 'AUTH_FAIL' } }), 'AUTH_FAIL');
  });

  it('getApiErrorCode extracts from top-level code', () => {
    assert.equal(getApiErrorCode({ code: 'TOP_CODE' }), 'TOP_CODE');
  });

  it('getApiErrorCode returns undefined for non-string code', () => {
    assert.equal(getApiErrorCode({ code: 123 }), undefined);
  });

  it('getApiErrorMessage extracts from nested error.message', () => {
    assert.equal(getApiErrorMessage({ error: { message: 'Oops' } }), 'Oops');
  });

  it('getApiErrorMessage extracts from top-level message', () => {
    assert.equal(getApiErrorMessage({ message: 'Top msg' }), 'Top msg');
  });

  it('getApiRequestId extracts from nested error.requestId', () => {
    assert.equal(getApiRequestId({ error: { requestId: 'req-42' } }), 'req-42');
  });

  it('getApiRequestId returns undefined when missing', () => {
    assert.equal(getApiRequestId({ error: {} }), undefined);
    assert.equal(getApiRequestId(null), undefined);
  });
});
