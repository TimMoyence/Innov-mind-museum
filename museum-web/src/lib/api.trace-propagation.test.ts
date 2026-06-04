/**
 * RED — TD-47: the hand-written fetch wrapper in `api.ts` does NOT forward the
 * active Sentry trace context (`sentry-trace` / `baggage`) on the happy path.
 *
 * The browser SDK patches client-side `fetch` (and error paths are auto-captured),
 * but server-rendered RSC requests that go through THIS wrapper bypass that
 * instrumentation, so admin web → backend calls don't show up in the correlated
 * trace. The fix forwards `Sentry.getTraceData()` (the v8+ manual-propagation
 * helper) into the request headers.
 *
 * Isolated in its own file with a per-file `vi.mock('@sentry/nextjs')` so the
 * 40+ existing api.test.ts cases (which don't mock Sentry) are untouched.
 *
 * Run scope:
 *   pnpm vitest run src/lib/api.trace-propagation.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { requireIndex } from '@/__tests__/helpers/require-index';

const { getTraceDataMock } = vi.hoisted(() => ({ getTraceDataMock: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({
  getTraceData: getTraceDataMock,
}));

// Imported AFTER the mock is registered (vi.mock is hoisted above this anyway).
import { apiGet, apiPost } from './api';

function mockFetch() {
  const defaults = {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({}),
  };
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(defaults as Response);
}

function headersOf(spy: ReturnType<typeof mockFetch>): Record<string, string> {
  const [, init] = requireIndex(spy.mock.calls, 0, 'fetch.calls');
  return (init as RequestInit).headers as Record<string, string>;
}

describe('api.ts — Sentry trace propagation (TD-47)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getTraceDataMock.mockReset();
  });

  it('forwards sentry-trace and baggage from getTraceData() on a GET', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-1',
      baggage: 'sentry-environment=production,sentry-release=1.0.0',
    });
    const spy = mockFetch();

    await apiGet('/api/items');

    const headers = headersOf(spy);
    expect(headers['sentry-trace']).toBe(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-1',
    );
    expect(headers.baggage).toBe('sentry-environment=production,sentry-release=1.0.0');
  });

  it('forwards trace headers on a state-changing POST (alongside CSRF handling)', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': 'cccccccccccccccccccccccccccccccc-dddddddddddddddd-1',
      baggage: 'sentry-environment=production',
    });
    const spy = mockFetch();

    await apiPost('/api/items', { name: 'x' });

    const headers = headersOf(spy);
    expect(headers['sentry-trace']).toBe(
      'cccccccccccccccccccccccccccccccc-dddddddddddddddd-1',
    );
    expect(headers.baggage).toBe('sentry-environment=production');
  });

  it('adds no trace headers when getTraceData() returns an empty context', async () => {
    getTraceDataMock.mockReturnValue({});
    const spy = mockFetch();

    await apiGet('/api/items');

    const headers = headersOf(spy);
    expect(headers['sentry-trace']).toBeUndefined();
    expect(headers.baggage).toBeUndefined();
  });
});
