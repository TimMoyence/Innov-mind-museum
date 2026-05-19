/**
 * W3 (spec R6/R7) — assert that the Nominatim reverse-geocode client emits
 * a Langfuse span on every call (hit / miss / error) plus the matching
 * Prometheus counter labels. No real HTTP — fetch is mocked.
 */

import {
  createCachedNominatimClient,
  reverseGeocodeWithNominatim,
} from '@shared/http/nominatim.client';
import { getLangfuse } from '@shared/observability/langfuse.client';
import {
  nominatimRequestDurationSeconds,
  nominatimRequestsTotal,
} from '@shared/observability/prometheus-metrics';

import type { CacheService } from '@shared/cache/cache.port';

jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: jest.fn(),
}));

interface SpanInput {
  name: string;
  input: { lat_3dec: number; lng_3dec: number; cached: boolean };
}

const span = {
  update: jest.fn().mockReturnThis(),
  end: jest.fn().mockReturnThis(),
};
const langfuse = {
  span: jest.fn((_input: SpanInput) => span),
};

beforeEach(() => {
  (getLangfuse as jest.Mock).mockReturnValue(langfuse);
  span.update.mockClear();
  span.end.mockClear();
  langfuse.span.mockClear();
});

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('reverseGeocodeWithNominatim — Langfuse span + Prom counter', () => {
  it('emits a span with outcome=hit on a successful resolve', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'Louvre, Paris',
        address: { city: 'Paris', country: 'France' },
      }),
    });
    const before = await readMetric('nominatim_requests_total', { outcome: 'hit' });

    await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(langfuse.span).toHaveBeenCalledTimes(1);
    const spanArgs = langfuse.span.mock.calls[0]?.[0];
    expect(spanArgs?.name).toBe('geo.nominatim.reverse');
    expect(spanArgs?.input.lat_3dec).toBe(48.861);
    expect(spanArgs?.input.lng_3dec).toBe(2.338);
    expect(spanArgs?.input.cached).toBe(false);
    expect(span.update).toHaveBeenCalledWith(
      expect.objectContaining({ output: expect.objectContaining({ outcome: 'hit' }) }),
    );
    expect(span.end).toHaveBeenCalledTimes(1);
    const after = await readMetric('nominatim_requests_total', { outcome: 'hit' });
    expect(after - before).toBeGreaterThanOrEqual(1);
  });

  it('emits a span with outcome=error when fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    const before = await readMetric('nominatim_requests_total', { outcome: 'error' });

    const result = await reverseGeocodeWithNominatim(48.86, 2.34);

    expect(result).toBeNull();
    expect(span.update).toHaveBeenCalledWith(
      expect.objectContaining({ output: expect.objectContaining({ outcome: 'error' }) }),
    );
    const after = await readMetric('nominatim_requests_total', { outcome: 'error' });
    expect(after - before).toBeGreaterThanOrEqual(1);
  });

  it('emits a span with outcome=miss when Nominatim returns empty display_name', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}), // no display_name → mapper returns null
    });

    await reverseGeocodeWithNominatim(48.86, 2.34);

    expect(span.update).toHaveBeenCalledWith(
      expect.objectContaining({ output: expect.objectContaining({ outcome: 'miss' }) }),
    );
  });

  it('observes nominatim_request_duration_seconds for live calls', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: 'X' }),
    });
    const observeSpy = jest.spyOn(nominatimRequestDurationSeconds, 'observe');

    await reverseGeocodeWithNominatim(48.86, 2.34);

    expect(observeSpy).toHaveBeenCalled();
    observeSpy.mockRestore();
  });
});

describe('createCachedNominatimClient — cache-hit span + counter', () => {
  it('emits a cached-outcome span without firing fetch when the cache returns a value', async () => {
    global.fetch = jest.fn(); // should NOT be called

    const cache: CacheService = {
      get: jest.fn().mockResolvedValue({
        value: { displayName: 'X', address: {} },
        storedAtMs: Date.now(),
        ttlSeconds: 60,
      }),
      set: jest.fn(),
      del: jest.fn(),
      delete: jest.fn(),
    } as unknown as CacheService;
    const before = await readMetric('nominatim_requests_total', { outcome: 'cached' });

    const client = createCachedNominatimClient(cache);
    const out = await client(48.86, 2.34);

    expect(out).toEqual({ displayName: 'X', address: {} });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(langfuse.span).toHaveBeenCalledTimes(1);
    expect(span.update).toHaveBeenCalledWith(
      expect.objectContaining({ output: expect.objectContaining({ cached: true }) }),
    );
    const after = await readMetric('nominatim_requests_total', { outcome: 'cached' });
    expect(after - before).toBeGreaterThanOrEqual(1);
  });
});

/**
 * Reads the current value of `nominatim_requests_total` for the given
 * `{outcome}` label, returning 0 if the series hasn't been observed yet.
 * Uses prom-client's async `.get()` to avoid coupling to private fields.
 */
async function readMetric(_name: string, labels: { outcome: string }): Promise<number> {
  const counter = nominatimRequestsTotal as unknown as {
    get: () => Promise<{ values: Array<{ value: number; labels: Record<string, string> }> }>;
  };
  const data = await counter.get();
  const match = data.values.find((row) => row.labels.outcome === labels.outcome);
  return match ? match.value : 0;
}
