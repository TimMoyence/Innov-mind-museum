import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ApiError,
  setTokens,
  clearTokens,
  getAccessToken,
  registerLogoutHandler,
  apiGet,
  apiPost,
  apiPatch,
} from './api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const defaults = {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({}),
    ...response,
  };
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(defaults as Response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('api.ts — token store', () => {
  beforeEach(() => {
    clearTokens();
  });

  it('getAccessToken returns null when no token is set', () => {
    expect(getAccessToken()).toBeNull();
  });

  it('setTokens stores the access token', () => {
    setTokens('access-123', 'refresh-456');
    expect(getAccessToken()).toBe('access-123');
  });

  it('clearTokens resets the access token to null', () => {
    setTokens('a', 'b');
    clearTokens();
    expect(getAccessToken()).toBeNull();
  });
});

describe('api.ts — ApiError', () => {
  it('has correct status, statusText, and message', () => {
    const err = new ApiError(404, 'Not Found', 'Resource missing');
    expect(err.status).toBe(404);
    expect(err.statusText).toBe('Not Found');
    expect(err.message).toBe('Resource missing');
    expect(err.name).toBe('ApiError');
  });

  it('is an instance of Error', () => {
    const err = new ApiError(500, 'Internal Server Error', 'boom');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('api.ts — request functions', () => {
  beforeEach(() => {
    clearTokens();
    vi.restoreAllMocks();
  });

  it('apiGet sends GET request and returns JSON', async () => {
    const spy = mockFetch({ json: () => Promise.resolve({ id: 1 }) });

    const data = await apiGet<{ id: number }>('/api/items');

    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/items');
    expect((init as RequestInit).method).toBe('GET');
    expect(data).toEqual({ id: 1 });
  });

  it('apiPost sends POST request with JSON body', async () => {
    const spy = mockFetch({ json: () => Promise.resolve({ ok: true }) });

    await apiPost('/api/items', { name: 'test' });

    const [, init] = spy.mock.calls[0];
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe(JSON.stringify({ name: 'test' }));
  });

  it('apiPatch sends PATCH request', async () => {
    const spy = mockFetch({ json: () => Promise.resolve({}) });

    await apiPatch('/api/items/1', { name: 'updated' });

    const [, init] = spy.mock.calls[0];
    expect((init as RequestInit).method).toBe('PATCH');
  });

  it('attaches Authorization header when token is set', async () => {
    setTokens('my-token', 'my-refresh');
    const spy = mockFetch({ json: () => Promise.resolve({}) });

    await apiGet('/api/me');

    const [, init] = spy.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer my-token');
  });

  it('does not attach Authorization header when no token', async () => {
    const spy = mockFetch({ json: () => Promise.resolve({}) });

    await apiGet('/api/public');

    const [, init] = spy.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('throws ApiError on non-ok response', async () => {
    mockFetch({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: () => Promise.resolve({ message: 'Validation failed' }),
    });

    await expect(apiGet('/api/bad')).rejects.toThrow(ApiError);
    await expect(apiGet('/api/bad')).rejects.toMatchObject({
      status: 422,
      message: 'Validation failed',
    });
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch({ status: 204, ok: true });

    const result = await apiGet('/api/delete');

    expect(result).toBeUndefined();
  });

  it('calls logout handler on 401 without refresh token', async () => {
    const logoutSpy = vi.fn();
    registerLogoutHandler(logoutSpy);

    mockFetch({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({}),
    });

    await expect(apiGet('/api/protected')).rejects.toThrow(ApiError);
    expect(logoutSpy).toHaveBeenCalledOnce();
  });
});
