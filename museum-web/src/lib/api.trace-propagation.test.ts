import { describe, it, expect, beforeEach, vi } from 'vitest';

import { requireIndex } from '@/__tests__/helpers/require-index';

const { getTraceDataMock } = vi.hoisted(() => ({ getTraceDataMock: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({
  getTraceData: getTraceDataMock,
}));

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
    expect(headers['sentry-trace']).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-1');
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
    expect(headers['sentry-trace']).toBe('cccccccccccccccccccccccccccccccc-dddddddddddddddd-1');
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
