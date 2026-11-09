import {
  WikidataBreakerClient,
  type WikidataBreakerConfig,
} from '@modules/chat/adapters/secondary/search/wikidata-breaker';
import { WikidataClient } from '@modules/chat/adapters/secondary/search/wikidata.client';
import { KnowledgeBaseService } from '@modules/chat/useCase/knowledge/knowledge-base.service';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';
import type { WikidataKbDumpRepositoryPort } from '@modules/chat/domain/ports/wikidata-kb-dump.port';

const MONA: ArtworkFacts = { qid: 'Q12418', title: 'Mona Lisa (dump)' };

const BREAKER_CFG: WikidataBreakerConfig = {
  timeoutMs: 5000,
  errorThresholdPercentage: 50,
  resetTimeoutMs: 200,
  volumeThreshold: 5,
  capacity: 5,
};

const KB_CFG = {
  timeoutMs: 2000,
  cacheTtlSeconds: 60,
  cacheMaxEntries: 100,
  localDumpFallbackAfterMs: 100,
};

class StubDumpRepo implements WikidataKbDumpRepositoryPort {
  public calls = 0;
  public upsertCalls = 0;
  constructor(private readonly facts: ArtworkFacts | null) {}
  async findFactsBySearchTerm(): Promise<ArtworkFacts | null> {
    this.calls++;
    return this.facts;
  }
  async upsert(): Promise<void> {
    this.upsertCalls++;
  }
}

const wait = (ms: number): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

function buildChain(dumpRepo: WikidataKbDumpRepositoryPort): {
  service: KnowledgeBaseService;
  breaker: WikidataBreakerClient;
} {
  const client = new WikidataClient();
  const breaker = new WikidataBreakerClient(client, BREAKER_CFG);
  const service = new KnowledgeBaseService(breaker, KB_CFG, undefined, {
    breakerState: () => breaker.getState(),
    dumpRepo,
  });
  return { service, breaker };
}

describe('C5 wiring — KnowledgeBaseService → WikidataBreakerClient → WikidataClient (real)', () => {
  const fetchSpy = jest.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  it('Live path: cache miss → SPARQL OK → facts returned, breaker stays CLOSED', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          Promise.resolve({
            search: [{ id: 'Q12418', label: 'Mona Lisa', description: 'painting by Leonardo' }],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          Promise.resolve({
            results: {
              bindings: [
                {
                  creatorLabel: { value: 'Leonardo da Vinci' },
                  inception: { value: '1503-01-01T00:00:00Z' },
                },
              ],
            },
          }),
      } as Response);

    const dump = new StubDumpRepo(null);
    const { service, breaker } = buildChain(dump);

    const facts = await service.lookupFacts('Mona Lisa');

    expect(facts?.title).toBe('Mona Lisa');
    expect(facts?.artist).toBe('Leonardo da Vinci');
    expect(breaker.getState().name).toBe('CLOSED');
    expect(dump.calls).toBe(0);
  });

  it('5xx storm trips breaker → cascade hits dump after soak → returns dump facts', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);

    const dump = new StubDumpRepo(MONA);
    const { service, breaker } = buildChain(dump);

    for (let i = 0; i < 5; i++) {
      await service.lookupFacts(`probe-${i}`);
    }
    expect(breaker.getState().name).toBe('OPEN');

    fetchSpy.mockClear();
    const withinSoak = await service.lookupFacts('Mona Lisa');
    expect(withinSoak).toBeNull();
    expect(dump.calls).toBe(0);

    await wait(KB_CFG.localDumpFallbackAfterMs + 20);
    const afterSoak = await service.lookupFacts('Mona Lisa');
    expect(afterSoak?.title).toBe('Mona Lisa (dump)');
    expect(dump.calls).toBe(1);
  });

  it('Step 7.1 DoD — OPEN past soak + dump miss → null fail-open (jamais throw)', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as Response);

    const dump = new StubDumpRepo(null);
    const { service, breaker } = buildChain(dump);

    for (let i = 0; i < 5; i++) {
      await service.lookupFacts(`probe-${i}`);
    }
    expect(breaker.getState().name).toBe('OPEN');

    await wait(KB_CFG.localDumpFallbackAfterMs + 20);

    const result = await service.lookupFacts('UnknownArt');
    expect(result).toBeNull();
    expect(dump.calls).toBeGreaterThan(0);
  });

  it('HALF_OPEN recovery: success after reset window → breaker CLOSED, live path resumes', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    const dump = new StubDumpRepo(null);
    const { service, breaker } = buildChain(dump);

    for (let i = 0; i < 5; i++) {
      await service.lookupFacts(`probe-${i}`);
    }
    expect(breaker.getState().name).toBe('OPEN');

    await wait(BREAKER_CFG.resetTimeoutMs + 20);
    expect(breaker.getState().name).toBe('HALF_OPEN');

    fetchSpy.mockReset();
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          Promise.resolve({
            search: [{ id: 'Q12418', label: 'Mona Lisa', description: 'painting' }],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          Promise.resolve({ results: { bindings: [{ creatorLabel: { value: 'Leonardo' } }] } }),
      } as Response);

    const facts = await service.lookupFacts('Mona Lisa');
    expect(facts?.title).toBe('Mona Lisa');
    expect(breaker.getState().name).toBe('CLOSED');
  });
});
