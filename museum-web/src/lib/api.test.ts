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

/** Sets a csrf_token cookie on the jsdom `document` for the duration of a test. */
function setCsrfCookie(value: string): void {
  document.cookie = `csrf_token=${value}; Path=/`;
}

function clearCsrfCookie(): void {
  document.cookie = 'csrf_token=; Path=/; Max-Age=0';
}

// ---------------------------------------------------------------------------
// F7 (2026-04-30) — cookie auth + CSRF double-submit
// ---------------------------------------------------------------------------

describe('api.ts — token store (F7 backward-compat shim)', () => {
  beforeEach(() => {
    clearTokens();
    clearCsrfCookie();
  });

  it('getAccessToken returns null (cookies are HttpOnly, JS cannot read)', () => {
    expect(getAccessToken()).toBeNull();
  });

  it('setTokens is a no-op post-F7 (tokens live in HttpOnly cookies)', () => {
    setTokens('access-123', 'refresh-456');
    expect(getAccessToken()).toBeNull();
  });

  it('clearTokens is a no-op post-F7 (cookie clearing happens server-side via /logout)', () => {
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
    clearCsrfCookie();
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

  it('every request uses credentials: include so HttpOnly cookies flow', async () => {
    const spy = mockFetch({ json: () => Promise.resolve({}) });

    await apiGet('/api/me');

    const [, init] = spy.mock.calls[0];
    expect((init as RequestInit).credentials).toBe('include');
  });

  it('does NOT attach Authorization header — cookie auth replaces Bearer (F7)', async () => {
    const spy = mockFetch({ json: () => Promise.resolve({}) });

    await apiGet('/api/me');

    const [, init] = spy.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('attaches X-CSRF-Token header on POST when csrf_token cookie is present', async () => {
    setCsrfCookie('abc-csrf-123');
    const spy = mockFetch({ json: () => Promise.resolve({}) });

    await apiPost('/api/items', { x: 1 });

    const [, init] = spy.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBe('abc-csrf-123');
  });

  it('attaches X-CSRF-Token on PATCH (state-changing method)', async () => {
    setCsrfCookie('csrf-patch');
    const spy = mockFetch({ json: () => Promise.resolve({}) });

    await apiPatch('/api/items/1', { x: 2 });

    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBe('csrf-patch');
  });

  it('does NOT attach X-CSRF-Token on GET (state-changing methods only)', async () => {
    setCsrfCookie('should-not-appear');
    const spy = mockFetch({ json: () => Promise.resolve({}) });

    await apiGet('/api/items');

    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBeUndefined();
  });

  it('omits X-CSRF-Token on POST when no csrf_token cookie is set (rollout window)', async () => {
    const spy = mockFetch({ json: () => Promise.resolve({}) });

    await apiPost('/api/items', {});

    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBeUndefined();
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

  it('calls logout handler on 401 when refresh also fails', async () => {
    const logoutSpy = vi.fn();
    registerLogoutHandler(logoutSpy);

    // First call → 401, second call (refresh) → 401, then onLogout fires.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({}),
    } as Response);

    await expect(apiGet('/api/protected')).rejects.toThrow(ApiError);
    expect(logoutSpy).toHaveBeenCalledOnce();
  });
});
