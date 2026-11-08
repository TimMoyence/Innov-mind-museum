import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, apiPost, registerLogoutHandler } from '@/lib/api';

// A minimal Response stub good enough for the request() core (status, ok, json).
function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 401 ? 'Unauthorized' : 'OK',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('api client — skipAuthRefresh + ApiError.body', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // Neutralise the csrf-cookie read (jsdom document.cookie is empty anyway).
    Object.defineProperty(document, 'cookie', { value: '', writable: true, configurable: true });
    // Reset any previously-registered logout handler to a no-op spy by default;
    // individual tests re-register their own.
    registerLogoutHandler(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('(a) skipAuthRefresh: a 401 throws ApiError without a 2nd fetch and without calling onLogout', async () => {
    const logoutSpy = vi.fn();
    registerLogoutHandler(logoutSpy);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'bad credentials' } }),
    );

    await expect(
      apiPost('/api/auth/login', { email: 'a@b.c', password: 'x' }, { skipAuthRefresh: true }),
    ).rejects.toBeInstanceOf(ApiError);

    // Exactly ONE network call — no refresh, no retry.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The session-expiry logout path MUST NOT fire on a domain 401.
    expect(logoutSpy).not.toHaveBeenCalled();
  });

  it('(b) regression: a normal 401 still attempts exactly one refresh', async () => {
    // 1st: the original POST 401s. 2nd: the refresh POST (api.ts doRefresh).
    // 3rd: the retried original POST. We make the refresh succeed then the
    // retried call also succeed so we can count: 3 fetch calls = one refresh
    // cycle. (If skipAuthRefresh wrongly defaulted on, there'd be only 1.)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiPost('/api/auth/some-protected', { x: 1 });

    // original + refresh + retried original = 3.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The 2nd call is the refresh endpoint.
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/api/auth/refresh');
  });
});
