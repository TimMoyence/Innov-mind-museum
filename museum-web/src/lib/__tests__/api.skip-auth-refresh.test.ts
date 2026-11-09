import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, apiPost, registerLogoutHandler } from '@/lib/api';

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
    Object.defineProperty(document, 'cookie', { value: '', writable: true, configurable: true });
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

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logoutSpy).not.toHaveBeenCalled();
  });

  it('(b) regression: a normal 401 still attempts exactly one refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiPost('/api/auth/some-protected', { x: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/api/auth/refresh');
  });
});
