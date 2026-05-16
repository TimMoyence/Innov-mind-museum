/**
 * R1 RED — Axios 402 paywall interceptor (T1.10 axiom — Q in brief).
 *
 * Pins R1 §1 R24 + §3.7 D7 down BEFORE implementation : the response error
 * interceptor on `httpClient` MUST intercept 402 responses with body
 * `{ code: 'QUOTA_EXCEEDED' }` and invoke the handler registered via
 * `setPaywallHandler(fn)` (setter-injection mirror of
 * `setUnauthorizedHandler` / `setAuthRefreshHandler`).
 *
 * Contract pinned :
 *  - 402 + `code: 'QUOTA_EXCEEDED'` → handler called once with
 *    `{ tier, currentCount, limit, resetAt }`.
 *  - 402 without the `QUOTA_EXCEEDED` code → handler NOT called.
 *  - Non-402 errors → handler NOT called.
 *  - When handler is `null` (unregistered) → no throw, error still rejected.
 *  - The 402 error STILL propagates to `.catch()` after the handler runs
 *    (R24 — "Don't swallow the error" so chat-session-create flow can also
 *    surface a fallback).
 *
 * MUST FAIL at baseline `cd7e22bc` — `setPaywallHandler` does not exist
 * (verified : only `setUnauthorizedHandler`, `setAuthRefreshHandler`,
 * `setTokenProvider` are exported today).
 */
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
  setPaywallHandler,
  setAuthRefreshHandler,
  setUnauthorizedHandler,
} from '@/shared/infrastructure/httpClient';

interface QuotaInfo {
  tier: string;
  currentCount: number;
  limit: number;
  resetAt: string;
}

const QUOTA_BODY: QuotaInfo & { code: string } = {
  code: 'QUOTA_EXCEEDED',
  tier: 'free',
  currentCount: 3,
  limit: 3,
  resetAt: '2026-06-01T00:00:00.000Z',
};

/**
 * Sends a request via the configured `httpClient` whose mock adapter
 * synthesises a response w/ the given status + body. We use the axios
 * adapter override (already used by the existing httpClient.test.ts) so
 * the interceptor logic under test runs against the synthetic response.
 */
class SyntheticAxiosError extends Error {
  response: { status: number; data: unknown };
  config: { url: string; method: string };
  constructor(status: number, data: unknown) {
    super(`synthetic ${String(status)}`);
    this.response = { status, data };
    this.config = { url: '/api/sessions', method: 'POST' };
  }
}

const requestWithStubbedResponse = async (status: number, data: unknown): Promise<unknown> => {
  return httpClient
    .request({
      url: '/api/sessions',
      method: 'POST',
      requiresAuth: true,
      adapter: () => Promise.reject(new SyntheticAxiosError(status, data)) as never,
    } as never)
    .then(
      () => null,
      (err: unknown) => err,
    );
};

describe('httpClient — 402 paywall interceptor (R1 §1 R24 + §3.7 D7)', () => {
  beforeEach(() => {
    setAuthRefreshHandler(null);
    setUnauthorizedHandler(null);
    setPaywallHandler(null);
  });

  // ── R24 — 402 + QUOTA_EXCEEDED triggers handler ─────────────────────

  it('R24: 402 + code=QUOTA_EXCEEDED → registered handler called once with payload', async () => {
    const handler = jest.fn();
    setPaywallHandler(handler);

    await requestWithStubbedResponse(402, QUOTA_BODY);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'free',
        currentCount: 3,
        limit: 3,
        resetAt: '2026-06-01T00:00:00.000Z',
      }),
    );
  });

  it('R24: 402 + QUOTA_EXCEEDED still propagates the error to .catch()', async () => {
    const handler = jest.fn();
    setPaywallHandler(handler);

    const err = await requestWithStubbedResponse(402, QUOTA_BODY);
    expect(err).toBeTruthy();
    // The mapped error MUST surface so calling code's mutation `.catch()`
    // can still react — additive, not exclusive (R1 §3.7 D7 rationale).
  });

  // ── 402 WITHOUT QUOTA_EXCEEDED code → handler ignored ───────────────

  it('402 with different code (e.g. PAYMENT_REQUIRED_OTHER) → handler NOT called', async () => {
    const handler = jest.fn();
    setPaywallHandler(handler);

    await requestWithStubbedResponse(402, {
      code: 'PAYMENT_REQUIRED_OTHER',
      tier: 'free',
    });

    expect(handler).not.toHaveBeenCalled();
  });

  // ── Non-402 errors → handler ignored ─────────────────────────────────

  it('500 → handler NOT called', async () => {
    const handler = jest.fn();
    setPaywallHandler(handler);
    await requestWithStubbedResponse(500, { message: 'server down' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('429 (daily chat limit) → handler NOT called (N15 — 402 vs 429 separation)', async () => {
    const handler = jest.fn();
    setPaywallHandler(handler);
    await requestWithStubbedResponse(429, { code: 'DAILY_LIMIT_REACHED', limit: 100 });
    expect(handler).not.toHaveBeenCalled();
  });

  // ── No handler registered → no throw ─────────────────────────────────

  it('handler=null → 402 response does not throw / no crash', async () => {
    setPaywallHandler(null);
    const err = await requestWithStubbedResponse(402, QUOTA_BODY);
    expect(err).toBeTruthy();
    // The interceptor must short-circuit when handler is null — no
    // ReferenceError / TypeError surfacing.
  });
});
