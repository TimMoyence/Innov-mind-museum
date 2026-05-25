import CircuitBreaker from 'opossum';

import {
  WikidataBreakerClient,
  type WikidataBreakerConfig,
} from '@modules/chat/adapters/secondary/search/wikidata-breaker';
import { WikidataTransientError } from '@modules/chat/adapters/secondary/search/wikidata.client';
import { registry } from '@shared/observability/prometheus-metrics';

import type {
  ArtworkFacts,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';

const MONA: ArtworkFacts = { qid: 'Q12418', title: 'Mona Lisa' };

const baseConfig: WikidataBreakerConfig = {
  timeoutMs: 5000,
  errorThresholdPercentage: 50,
  resetTimeoutMs: 80, // small for fast tests
  volumeThreshold: 5,
  capacity: 5,
};

interface InnerStub {
  lookupOrThrow: jest.Mock<Promise<ArtworkFacts | null>, [KnowledgeBaseQuery]>;
}

function makeInner(): InnerStub {
  return { lookupOrThrow: jest.fn() };
}

const QUERY: KnowledgeBaseQuery = { searchTerm: 'Mona Lisa' };

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function driveFailures(
  client: WikidataBreakerClient,
  inner: InnerStub,
  n: number,
): Promise<void> {
  inner.lookupOrThrow.mockRejectedValue(new WikidataTransientError(new Error('5xx'), 'search'));
  for (let i = 0; i < n; i++) {
    await client.lookup(QUERY);
  }
}

describe('WikidataBreakerClient', () => {
  it('1) CLOSED on init, all successes keep it CLOSED', async () => {
    const inner = makeInner();
    inner.lookupOrThrow.mockResolvedValue(MONA);
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    for (let i = 0; i < 10; i++) {
      const r = await client.lookup(QUERY);
      expect(r).toEqual(MONA);
    }

    expect(client.getState().name).toBe('CLOSED');
  });

  it('2) 5 consecutive transient failures open the breaker', async () => {
    const inner = makeInner();
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    await driveFailures(client, inner, 5);

    expect(client.getState().name).toBe('OPEN');
    expect(client.getState().openSince).toBeGreaterThan(0);
  });

  it('3) OPEN state returns null without invoking inner', async () => {
    const inner = makeInner();
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    await driveFailures(client, inner, 5);
    expect(client.getState().name).toBe('OPEN');

    const callsBeforeProbe = inner.lookupOrThrow.mock.calls.length;
    const result = await client.lookup(QUERY);

    expect(result).toBeNull();
    expect(inner.lookupOrThrow.mock.calls.length).toBe(callsBeforeProbe);
  });

  it('4) After resetTimeout the breaker transitions to HALF_OPEN', async () => {
    const inner = makeInner();
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    await driveFailures(client, inner, 5);
    expect(client.getState().name).toBe('OPEN');

    await wait(baseConfig.resetTimeoutMs + 30);

    expect(['HALF_OPEN', 'CLOSED']).toContain(client.getState().name);
    const halfOpen = client.getState().name;
    expect(halfOpen).toBe('HALF_OPEN');
  });

  it('5) HALF_OPEN + success closes the breaker', async () => {
    const inner = makeInner();
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    await driveFailures(client, inner, 5);
    await wait(baseConfig.resetTimeoutMs + 30);
    expect(client.getState().name).toBe('HALF_OPEN');

    inner.lookupOrThrow.mockReset();
    inner.lookupOrThrow.mockResolvedValue(MONA);

    const probe = await client.lookup(QUERY);
    expect(probe).toEqual(MONA);
    expect(client.getState().name).toBe('CLOSED');
  });

  it('6) HALF_OPEN + failure re-opens the breaker', async () => {
    const inner = makeInner();
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    await driveFailures(client, inner, 5);
    await wait(baseConfig.resetTimeoutMs + 30);
    expect(client.getState().name).toBe('HALF_OPEN');

    inner.lookupOrThrow.mockReset();
    inner.lookupOrThrow.mockRejectedValue(new WikidataTransientError(new Error('5xx'), 'search'));

    await client.lookup(QUERY);

    expect(client.getState().name).toBe('OPEN');
  });

  it('7) Legitimate null returns (entity not found / 4xx) do not trip the breaker', async () => {
    const inner = makeInner();
    inner.lookupOrThrow.mockResolvedValue(null);
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    for (let i = 0; i < 12; i++) {
      const r = await client.lookup(QUERY);
      expect(r).toBeNull();
    }

    expect(client.getState().name).toBe('CLOSED');
  });
});

/**
 * C5 Phase 6.2 — Prometheus surface around the breaker. The client wires
 * opossum events (`success` / `failure` / `timeout` / `reject` /
 * `open|close|halfOpen`) into the three Wikidata SPARQL metrics declared in
 * `prometheus-metrics.ts`. The dashboard + alerts in
 * `infra/grafana/{dashboards,alerting}/wikidata-resilience.{json,yml}` consume
 * them.
 */
describe('WikidataBreakerClient — Prometheus instrumentation', () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  // Helper that pulls the current Counter value for a given label set out of
  // the registry. prom-client's Counter does not expose a synchronous getter
  // tied to label combos ; we have to read the registry snapshot.
  async function counterValue(metricName: string, labels: Record<string, string>): Promise<number> {
    const metric = registry.getSingleMetric(metricName);
    if (!metric) return 0;
    const data = await metric.get();
    const labelKeys = Object.keys(labels);
    const found = data.values.find((v) => labelKeys.every((k) => v.labels[k] === labels[k]));
    return found?.value ?? 0;
  }

  async function gaugeValue(metricName: string, labels: Record<string, string>): Promise<number> {
    return counterValue(metricName, labels);
  }

  async function histogramSampleCount(metricName: string): Promise<number> {
    const metric = registry.getSingleMetric(metricName);
    if (!metric) return 0;
    // prom-client's `Histogram.get()` shape exposes a `_count` aggregate via
    // a value whose `metricName` field ends with `_count`. The narrower
    // `MetricValue` type in the public surface omits that field, so we
    // dereference through `unknown` to read it safely.
    const data = (await metric.get()) as { values: { metricName?: string; value: number }[] };
    const count = data.values.find((v) => (v.metricName ?? '').endsWith('_count'));
    return count?.value ?? 0;
  }

  it('emits outcome=success + observes duration on a successful call', async () => {
    const inner = makeInner();
    inner.lookupOrThrow.mockResolvedValue(MONA);
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    await client.lookup(QUERY);

    expect(await counterValue('wikidata_sparql_requests_total', { outcome: 'success' })).toBe(1);
    expect(await histogramSampleCount('wikidata_sparql_request_duration_seconds')).toBe(1);
  });

  it('emits outcome=error on a non-rate-limit transient failure', async () => {
    const inner = makeInner();
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    inner.lookupOrThrow.mockRejectedValue(new WikidataTransientError({ status: 503 }, 'sparql'));
    await client.lookup(QUERY);

    expect(await counterValue('wikidata_sparql_requests_total', { outcome: 'error' })).toBe(1);
    expect(await counterValue('wikidata_sparql_requests_total', { outcome: 'rate_limit' })).toBe(0);
    // Failure still observes duration — the action ran end-to-end before throwing.
    expect(await histogramSampleCount('wikidata_sparql_request_duration_seconds')).toBe(1);
  });

  it('classifies 429 transients as outcome=rate_limit', async () => {
    const inner = makeInner();
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    inner.lookupOrThrow.mockRejectedValue(new WikidataTransientError({ status: 429 }, 'sparql'));
    await client.lookup(QUERY);

    expect(await counterValue('wikidata_sparql_requests_total', { outcome: 'rate_limit' })).toBe(1);
    expect(await counterValue('wikidata_sparql_requests_total', { outcome: 'error' })).toBe(0);
  });

  it('classifies opossum timeouts as outcome=timeout (deduped against failure)', async () => {
    const inner = makeInner();
    // 20ms per-call cutoff ; inner resolves after 200ms → opossum times out.
    const tightConfig: WikidataBreakerConfig = { ...baseConfig, timeoutMs: 20 };
    inner.lookupOrThrow.mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(MONA);
        }, 200);
      });
    });
    const client = new WikidataBreakerClient(inner as never, tightConfig);

    await client.lookup(QUERY);

    expect(await counterValue('wikidata_sparql_requests_total', { outcome: 'timeout' })).toBe(1);
    // Critical : the same call must NOT also be counted as a generic error,
    // otherwise opossum's `failure` follow-up event would double-count.
    expect(await counterValue('wikidata_sparql_requests_total', { outcome: 'error' })).toBe(0);
  });

  it('emits outcome=circuit_open when the breaker fallback returns null', async () => {
    const inner = makeInner();
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    // Trip the breaker first — 5 transient failures saturates the volumeThreshold.
    await driveFailures(client, inner, 5);
    expect(client.getState().name).toBe('OPEN');

    inner.lookupOrThrow.mockReset();
    // Next call must not even invoke the inner client — the breaker rejects.
    const before = await counterValue('wikidata_sparql_requests_total', {
      outcome: 'circuit_open',
    });
    const result = await client.lookup(QUERY);
    expect(result).toBeNull();
    expect(inner.lookupOrThrow).not.toHaveBeenCalled();

    const after = await counterValue('wikidata_sparql_requests_total', {
      outcome: 'circuit_open',
    });
    expect(after).toBe(before + 1);
  });

  it('updates the circuit_state gauge on open / halfOpen / close transitions', async () => {
    const inner = makeInner();
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    // Closed initially — first successful call seeds the gauge implicitly via
    // the constructor's seedClosedState ; if not, the explicit transitions
    // below still cover the contract.
    inner.lookupOrThrow.mockResolvedValue(MONA);
    await client.lookup(QUERY);

    await driveFailures(client, inner, 5);
    expect(await gaugeValue('wikidata_sparql_circuit_state', { state: 'open' })).toBe(1);
    expect(await gaugeValue('wikidata_sparql_circuit_state', { state: 'closed' })).toBe(0);
    expect(await gaugeValue('wikidata_sparql_circuit_state', { state: 'half_open' })).toBe(0);

    await wait(baseConfig.resetTimeoutMs + 30);
    expect(client.getState().name).toBe('HALF_OPEN');
    expect(await gaugeValue('wikidata_sparql_circuit_state', { state: 'half_open' })).toBe(1);
    expect(await gaugeValue('wikidata_sparql_circuit_state', { state: 'open' })).toBe(0);

    inner.lookupOrThrow.mockReset();
    inner.lookupOrThrow.mockResolvedValue(MONA);
    await client.lookup(QUERY);
    expect(client.getState().name).toBe('CLOSED');
    expect(await gaugeValue('wikidata_sparql_circuit_state', { state: 'closed' })).toBe(1);
    expect(await gaugeValue('wikidata_sparql_circuit_state', { state: 'half_open' })).toBe(0);
  });
});

/**
 * TD-OP-01 — `WikidataBreakerClient.dispose()` lifecycle.
 *
 * opossum's `new CircuitBreaker` starts an internal rolling-stats `setInterval`
 * that is never released unless `breaker.shutdown()` is called. Without a
 * `dispose()` method, every constructed client leaks that timer — the concrete
 * Stryker/Jest open-handle gotcha (CLAUDE.md § Stryker; lib-docs/opossum
 * LESSONS.md F1, PATTERNS.md §3 "DO call breaker.shutdown() ... on process
 * termination").
 *
 * Contract:
 *   - `dispose()` calls the underlying opossum `breaker.shutdown()` exactly once.
 *   - `dispose()` is idempotent — a second call does not throw and does not
 *     call `shutdown()` again.
 */
describe('WikidataBreakerClient — dispose() (TD-OP-01)', () => {
  let shutdownSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on the opossum prototype so we observe the breaker the client owns
    // internally without reaching into its private field.
    shutdownSpy = jest.spyOn(CircuitBreaker.prototype, 'shutdown');
  });

  afterEach(() => {
    shutdownSpy.mockRestore();
  });

  it('exposes a dispose() method', () => {
    const inner = makeInner();
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    expect(typeof (client as unknown as { dispose?: unknown }).dispose).toBe('function');

    client.dispose();
  });

  it('dispose() calls the underlying opossum breaker.shutdown() exactly once', () => {
    const inner = makeInner();
    const client = new WikidataBreakerClient(inner as never, baseConfig);
    // The constructor itself must not have triggered a shutdown.
    shutdownSpy.mockClear();

    client.dispose();

    expect(shutdownSpy).toHaveBeenCalledTimes(1);
  });

  it('dispose() is idempotent — a second call does not throw and does not re-shutdown', () => {
    const inner = makeInner();
    const client = new WikidataBreakerClient(inner as never, baseConfig);
    shutdownSpy.mockClear();

    client.dispose();
    expect(() => client.dispose()).not.toThrow();

    expect(shutdownSpy).toHaveBeenCalledTimes(1);
  });

  it('leaves no open opossum timer after dispose() (still CLOSED, no throw on use-after-construct)', async () => {
    const inner = makeInner();
    inner.lookupOrThrow.mockResolvedValue(MONA);
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    await client.lookup(QUERY);
    expect(client.getState().name).toBe('CLOSED');

    // dispose() must release the rolling-stats interval (asserted indirectly:
    // shutdown is invoked, and --detectOpenHandles must stay clean in the
    // green-phase verifier run per tasks.md DONE-WHEN).
    expect(() => client.dispose()).not.toThrow();
    expect(shutdownSpy).toHaveBeenCalled();
  });
});
