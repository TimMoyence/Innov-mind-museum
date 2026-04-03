import {
  toAxiosLikeError,
  toApiErrorPayload,
  getApiErrorCode,
  getApiErrorMessage,
  getApiRequestId,
  mapAxiosError,
} from '@/shared/infrastructure/httpErrorMapper';

describe('toAxiosLikeError', () => {
  it('returns null for null', () => {
    expect(toAxiosLikeError(null)).toBeNull();
  });

  it('returns null for primitives', () => {
    expect(toAxiosLikeError('string')).toBeNull();
    expect(toAxiosLikeError(42)).toBeNull();
  });

  it('returns null for plain object without axios fields', () => {
    expect(toAxiosLikeError({ random: true })).toBeNull();
  });

  it('returns the error for isAxiosError=true', () => {
    const err = { isAxiosError: true, message: 'fail' };
    expect(toAxiosLikeError(err)).toBe(err);
  });

  it('returns the error if it has a response property', () => {
    const err = { response: { status: 500 } };
    expect(toAxiosLikeError(err)).toBe(err);
  });

  it('returns the error if it has a config property', () => {
    const err = { config: {} };
    expect(toAxiosLikeError(err)).toBe(err);
  });

  it('returns the error if it has a code property', () => {
    const err = { code: 'ECONNABORTED' };
    expect(toAxiosLikeError(err)).toBe(err);
  });
});

describe('toApiErrorPayload', () => {
  it('returns null for null/undefined', () => {
    expect(toApiErrorPayload(null)).toBeNull();
    expect(toApiErrorPayload(undefined)).toBeNull();
  });

  it('returns null for primitives', () => {
    expect(toApiErrorPayload('text')).toBeNull();
  });

  it('returns the value for objects', () => {
    const payload = { error: { code: 'ERR' } };
    expect(toApiErrorPayload(payload)).toBe(payload);
  });
});

describe('getApiErrorCode', () => {
  it('returns nested error.code', () => {
    expect(getApiErrorCode({ error: { code: 'BAD_REQUEST' } })).toBe('BAD_REQUEST');
  });

  it('returns flat code as fallback', () => {
    expect(getApiErrorCode({ code: 'CONFLICT' })).toBe('CONFLICT');
  });

  it('returns undefined for non-string code', () => {
    expect(getApiErrorCode({ error: { code: 123 } })).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    expect(getApiErrorCode(null)).toBeUndefined();
  });
});

describe('getApiErrorMessage', () => {
  it('returns nested error.message', () => {
    expect(getApiErrorMessage({ error: { message: 'Invalid' } })).toBe('Invalid');
  });

  it('returns flat message as fallback', () => {
    expect(getApiErrorMessage({ message: 'Not found' })).toBe('Not found');
  });

  it('returns undefined for non-string message', () => {
    expect(getApiErrorMessage({ error: { message: 42 } })).toBeUndefined();
  });
});

describe('getApiRequestId', () => {
  it('returns nested requestId', () => {
    expect(getApiRequestId({ error: { requestId: 'req-123' } })).toBe('req-123');
  });

  it('returns undefined when no requestId', () => {
    expect(getApiRequestId({ error: {} })).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(getApiRequestId(null)).toBeUndefined();
  });
});

describe('mapAxiosError', () => {
  it('maps non-axios error to Unknown', () => {
    const result = mapAxiosError('random string');
    expect(result.kind).toBe('Unknown');
    expect(result.message).toBe('Unexpected error');
  });

  it('maps ECONNABORTED to Timeout', () => {
    const result = mapAxiosError({ code: 'ECONNABORTED' });
    expect(result.kind).toBe('Timeout');
  });

  it('maps Network Error to Network', () => {
    const result = mapAxiosError({ message: 'Network Error', isAxiosError: true });
    expect(result.kind).toBe('Network');
  });

  it('maps 401 to Unauthorized', () => {
    const result = mapAxiosError({ response: { status: 401 }, isAxiosError: true });
    expect(result.kind).toBe('Unauthorized');
  });

  it('maps 403 to Forbidden', () => {
    const result = mapAxiosError({ response: { status: 403 }, isAxiosError: true });
    expect(result.kind).toBe('Forbidden');
  });

  it('maps 403 with invalid token to Unauthorized', () => {
    const result = mapAxiosError({
      response: {
        status: 403,
        data: { error: { code: 'FORBIDDEN', message: 'Invalid token expired' } },
      },
      isAxiosError: true,
    });
    expect(result.kind).toBe('Unauthorized');
  });

  it('maps 404 to NotFound', () => {
    const result = mapAxiosError({ response: { status: 404 }, isAxiosError: true });
    expect(result.kind).toBe('NotFound');
  });

  it('maps 429 to RateLimited', () => {
    const result = mapAxiosError({ response: { status: 429 }, isAxiosError: true });
    expect(result.kind).toBe('RateLimited');
  });

  it('maps 422 to Validation', () => {
    const result = mapAxiosError({ response: { status: 422 }, isAxiosError: true });
    expect(result.kind).toBe('Validation');
  });

  it('maps 500 to Unknown server error', () => {
    const result = mapAxiosError({ response: { status: 500 }, isAxiosError: true });
    expect(result.kind).toBe('Unknown');
    expect(result.message).toBe('Unexpected server error');
  });
});
