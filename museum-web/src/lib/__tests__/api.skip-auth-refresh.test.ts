/**
 * T2.1 RED — api-client opt-out + body surfacing (D2 / Q2).
 *
 * The MFA challenge/recovery 401s are DOMAIN errors (wrong code / expired
 * session), NOT session-expiry. The current `request()` core treats any 401 as
 * session-expiry: it fires `refreshAccessToken()` (which calls `onLogout` on a
 * definitive failure) and retries. On the MFA path there is no session yet, so
 * the refresh fails → `onLogout` fires → the admin is bounced off the challenge
 * step (defeats spec R8/R11).
 *
 * This suite pins three contracts BEFORE the impl exists:
 *   (a) `apiPost(path, body, { skipAuthRefresh: true })` on a 401 throws an
 *       ApiError WITHOUT a second fetch and WITHOUT invoking the logout handler.
 *   (b) A normal `apiPost` on a 401 STILL attempts exactly one refresh (the
 *       existing behaviour must not regress — api.ts:186-196).
 *   (c) The thrown ApiError exposes the parsed JSON error body via `error.body`
 *       so callers can discriminate `mfaEnrollmentRequired` / `mfaRequired`.
 *
 * MUST FAIL today: `apiPost` has no `options` param, `ApiRequestOptions` has no
 * `skipAuthRefresh`, and `ApiError` has no `body` field.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, apiPost, registerLogoutHandler } from '@/lib/api';

// Intended (post-T2.2) public surface, viewed structurally so this RED test
// compiles BEFORE the impl exists. `apiPost` will gain an optional 3rd
// `{ skipAuthRefresh }` arg and `ApiError` an optional `body`. We bind to the
// real runtime functions via these typed views; at runtime today the 3rd arg is
// ignored (→ assertion (a) sees a 2nd fetch) and `.body` is undefined (→ (c)
// fails) — i.e. the failures are BEHAVIOURAL, not compile errors.
type ApiPostWithOptions = <T>(
  path: string,
  body?: unknown,
  options?: { skipAuthRefresh?: boolean },
) => Promise<T>;
const apiPostV2 = apiPost as unknown as ApiPostWithOptions;
type ApiErrorWithBody = ApiError & { body?: unknown };

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
      jsonResponse(401, { error: { code: 'INVALID_MFA_CODE', message: 'bad code' } }),
    );

    await expect(
      apiPostV2(
        '/api/auth/mfa/challenge',
        { mfaSessionToken: 't', code: '000000' },
        {
          skipAuthRefresh: true,
        },
      ),
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

  it('(c) the thrown ApiError exposes the parsed JSON body via error.body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { mfaEnrollmentRequired: true, redirectTo: '/admin/mfa' }),
    );

    let caught: unknown;
    try {
      await apiPostV2(
        '/api/auth/login',
        { email: 'a@b.c', password: 'x' },
        {
          skipAuthRefresh: true,
        },
      );
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const err = caught as ApiErrorWithBody;
    expect(err.status).toBe(403);
    expect(err.body).toEqual({ mfaEnrollmentRequired: true, redirectTo: '/admin/mfa' });
  });
});
