import CircuitBreaker from 'opossum';

import {
  WikidataBreakerClient,
  type WikidataBreakerConfig,
} from '@modules/chat/adapters/secondary/search/wikidata-breaker';
import { WikidataTransientError } from '@modules/chat/adapters/secondary/search/wikidata.client';

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
    await expect(client.lookup(QUERY)).rejects.toThrow();
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

  it('3) OPEN state signals the outage without invoking inner, so no caller mistakes it for a legitimate empty', async () => {
    const inner = makeInner();
    const client = new WikidataBreakerClient(inner as never, baseConfig);

    await driveFailures(client, inner, 5);
    expect(client.getState().name).toBe('OPEN');

    const callsBeforeProbe = inner.lookupOrThrow.mock.calls.length;

    await expect(client.lookup(QUERY)).rejects.toThrow('Breaker is open');
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

    await expect(client.lookup(QUERY)).rejects.toThrow('wikidata_transient_search');

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
