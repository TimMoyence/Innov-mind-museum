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
    inner.lookupOrThrow.mockRejectedValue(
      new WikidataTransientError(new Error('5xx'), 'search'),
    );

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
