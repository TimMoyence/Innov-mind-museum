const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 202,
    headers: {
      get: (key: string) => (key.toLowerCase() === 'x-plausible-dropped' ? null : null),
    },
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  } as unknown as Response);
  (globalThis as { fetch?: unknown }).fetch = fetchMock as unknown as typeof fetch;
});

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test.musaium.local';
  process.env.EXPO_PUBLIC_PLAUSIBLE_ENDPOINT_URL =
    'https://api.test.musaium.local/api/telemetry/funnel';
  process.env.EXPO_PUBLIC_PLAUSIBLE_DOMAIN = 'musaium.test';
});

interface PlausibleSut {
  trackFunnelEvent: (name: string, props?: Record<string, string>) => Promise<void>;
  __setHasAnalyticsConsentForTest: (fn: (() => boolean) | null) => void;
}

function loadPlausibleSut(): PlausibleSut {
  const mod = require('@/shared/analytics/plausible') as PlausibleSut;
  if (typeof mod.trackFunnelEvent !== 'function') {
    throw new Error(
      'Green contract violation: `@/shared/analytics/plausible` must export `trackFunnelEvent(name, props)` (PATTERNS.md §3.3).',
    );
  }
  if (typeof mod.__setHasAnalyticsConsentForTest !== 'function') {
    throw new Error(
      'Green contract violation: `@/shared/analytics/plausible` must export `__setHasAnalyticsConsentForTest(fn)` test seam so tests can control consent without mounting React.',
    );
  }
  return mod;
}

describe('Wave C5 / T-C52 — Plausible consent gate (FE)', () => {
  afterEach(() => {
    try {
      const mod = require('@/shared/analytics/plausible') as Partial<PlausibleSut>;
      mod.__setHasAnalyticsConsentForTest?.(null);
    } catch {}
    jest.resetModules();
  });

  it('R-C5b — consent NOT granted → 0 fetch call (fail-closed)', async () => {
    const sut = loadPlausibleSut();
    sut.__setHasAnalyticsConsentForTest(() => false);

    await sut.trackFunnelEvent('paywall_modal_shown', { tier: 'free' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('R-C5 — consent granted → exactly 1 POST to /api/telemetry/funnel with {name, props, url, domain}', async () => {
    const sut = loadPlausibleSut();
    sut.__setHasAnalyticsConsentForTest(() => true);

    await sut.trackFunnelEvent('paywall_modal_shown', { tier: 'free' });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();

    const [requestUrl, init] = call as [unknown, RequestInit | undefined];
    const urlString = typeof requestUrl === 'string' ? requestUrl : String(requestUrl);

    expect(urlString).toContain('/api/telemetry/funnel');

    expect(init).toBeDefined();
    expect(init?.method).toBe('POST');

    const bodyRaw = init?.body;
    expect(typeof bodyRaw).toBe('string');
    const body = JSON.parse(bodyRaw as string) as Record<string, unknown>;

    expect(body.name).toBe('paywall_modal_shown');
    expect(typeof body.url).toBe('string');
    expect((body.url as string).length).toBeGreaterThan(0);
    expect(typeof body.domain).toBe('string');
    expect((body.domain as string).length).toBeGreaterThan(0);

    expect(body.props).toEqual(expect.objectContaining({ tier: 'free' }));
  });

  it('R-C5 anti-PII — consent granted + props.email supplied → emitted body MUST NOT contain email (defense-in-depth)', async () => {
    const sut = loadPlausibleSut();
    sut.__setHasAnalyticsConsentForTest(() => true);

    await sut.trackFunnelEvent('paywall_email_captured', {
      tier: 'free',
      email: 'leak@example.test',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls[0] as [unknown, RequestInit])[1];
    const body = JSON.parse(init.body as string) as { props?: Record<string, unknown> };

    expect(body.props).toBeDefined();
    expect(body.props).not.toHaveProperty('email');

    expect(body.props).toEqual(expect.objectContaining({ tier: 'free' }));
  });
});
