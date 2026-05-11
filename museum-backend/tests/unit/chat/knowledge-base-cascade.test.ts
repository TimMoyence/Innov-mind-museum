import { KnowledgeBaseService } from '@modules/chat/useCase/knowledge/knowledge-base.service';
import { registry } from '@shared/observability/prometheus-metrics';

import type { BreakerState } from '@modules/chat/adapters/secondary/search/wikidata-breaker';
import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { WikidataKbDumpRepositoryPort } from '@modules/chat/domain/ports/wikidata-kb-dump.port';
import type { CacheService } from '@shared/cache/cache.port';

const MONA: ArtworkFacts = { qid: 'Q12418', title: 'Mona Lisa' };
const DUMP_MONA: ArtworkFacts = { qid: 'Q12418', title: 'Mona Lisa (from dump)' };

interface ProviderStub extends KnowledgeBaseProvider {
  lookup: jest.Mock<Promise<ArtworkFacts | null>, [{ searchTerm: string; language?: string }]>;
}
interface DumpStub extends WikidataKbDumpRepositoryPort {
  findFactsBySearchTerm: jest.Mock<Promise<ArtworkFacts | null>, [string, string?]>;
}

function makeProvider(): ProviderStub {
  return { lookup: jest.fn() };
}
function makeDump(): DumpStub {
  return { findFactsBySearchTerm: jest.fn() };
}

const baseConfig = {
  timeoutMs: 1000,
  cacheTtlSeconds: 60,
  cacheMaxEntries: 100,
  localDumpFallbackAfterMs: 60_000,
};

describe('KnowledgeBaseService cascade (C5.3)', () => {
  it('returns provider facts when breaker is CLOSED — no dump consulted', async () => {
    const provider = makeProvider();
    provider.lookup.mockResolvedValue(MONA);
    const dump = makeDump();
    const state: BreakerState = { name: 'CLOSED' };

    const svc = new KnowledgeBaseService(provider, baseConfig, undefined, {
      breakerState: () => state,
      dumpRepo: dump,
    });

    const facts = await svc.lookupFacts('Mona Lisa');
    expect(facts).toEqual(MONA);
    expect(dump.findFactsBySearchTerm).not.toHaveBeenCalled();
  });

  it('falls back to dump when provider returns null AND breaker OPEN past soak', async () => {
    const provider = makeProvider();
    provider.lookup.mockResolvedValue(null);
    const dump = makeDump();
    dump.findFactsBySearchTerm.mockResolvedValue(DUMP_MONA);

    const openSince = Date.now() - (baseConfig.localDumpFallbackAfterMs + 1000);
    const state: BreakerState = { name: 'OPEN', openSince };

    const svc = new KnowledgeBaseService(provider, baseConfig, undefined, {
      breakerState: () => state,
      dumpRepo: dump,
    });

    const facts = await svc.lookupFacts('Mona Lisa');
    expect(facts).toEqual(DUMP_MONA);
    expect(dump.findFactsBySearchTerm).toHaveBeenCalledWith('mona lisa', undefined);
  });

  it('does NOT fall back when OPEN but still within soak window', async () => {
    const provider = makeProvider();
    provider.lookup.mockResolvedValue(null);
    const dump = makeDump();
    dump.findFactsBySearchTerm.mockResolvedValue(DUMP_MONA);

    const openSince = Date.now() - 1000; // 1s ago, soak is 60s
    const state: BreakerState = { name: 'OPEN', openSince };

    const svc = new KnowledgeBaseService(provider, baseConfig, undefined, {
      breakerState: () => state,
      dumpRepo: dump,
    });

    const facts = await svc.lookupFacts('Mona Lisa');
    expect(facts).toBeNull();
    expect(dump.findFactsBySearchTerm).not.toHaveBeenCalled();
  });

  it('does NOT fall back when breaker is HALF_OPEN (active recovery probe)', async () => {
    const provider = makeProvider();
    provider.lookup.mockResolvedValue(null);
    const dump = makeDump();
    dump.findFactsBySearchTerm.mockResolvedValue(DUMP_MONA);

    const openSince = Date.now() - (baseConfig.localDumpFallbackAfterMs + 5000);
    const state: BreakerState = { name: 'HALF_OPEN', openSince };

    const svc = new KnowledgeBaseService(provider, baseConfig, undefined, {
      breakerState: () => state,
      dumpRepo: dump,
    });

    const facts = await svc.lookupFacts('Mona Lisa');
    expect(facts).toBeNull();
    expect(dump.findFactsBySearchTerm).not.toHaveBeenCalled();
  });

  it('OPEN past soak + dump miss → null fail-open (Step 7.1 DoD scenario)', async () => {
    const provider = makeProvider();
    provider.lookup.mockResolvedValue(null);
    const dump = makeDump();
    dump.findFactsBySearchTerm.mockResolvedValue(null);

    const openSince = Date.now() - (baseConfig.localDumpFallbackAfterMs + 1000);
    const state: BreakerState = { name: 'OPEN', openSince };

    const svc = new KnowledgeBaseService(provider, baseConfig, undefined, {
      breakerState: () => state,
      dumpRepo: dump,
    });

    const facts = await svc.lookupFacts('UnknownArt');
    expect(facts).toBeNull();
    expect(dump.findFactsBySearchTerm).toHaveBeenCalled();
  });

  it('no cascade wiring → behaves like pre-C5 (null when provider returns null)', async () => {
    const provider = makeProvider();
    provider.lookup.mockResolvedValue(null);

    const svc = new KnowledgeBaseService(provider, baseConfig);
    const facts = await svc.lookupFacts('Mona Lisa');
    expect(facts).toBeNull();
  });
});

/**
 * C5 Phase 6.2 — Prometheus surface around the KnowledgeBaseService. The
 * service emits :
 *   - `wikidata_cache_hits_total` on a Redis cache hit
 *   - `wikidata_cache_misses_total` whenever the provider is consulted
 *   - `wikidata_local_dump_hits_total` when cascade triggered AND dump returned facts
 *   - `wikidata_local_dump_misses_total` when cascade triggered AND dump returned null
 * Cascade trigger = breaker OPEN past `localDumpFallbackAfterMs` soak window.
 */
describe('KnowledgeBaseService — Prometheus instrumentation', () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  function makeCacheStub(seed?: { key: string; value: unknown }): CacheService {
    const store = new Map<string, unknown>();
    if (seed) store.set(seed.key, seed.value);
    return {
      get: async <T>(k: string): Promise<T | null> => (store.get(k) as T | undefined) ?? null,
      set: async (k: string, v: unknown): Promise<void> => {
        store.set(k, v);
      },
      del: async (): Promise<void> => undefined,
      delByPrefix: async (): Promise<void> => undefined,
      setNx: async (): Promise<boolean> => true,
      incrBy: async (): Promise<number | null> => 0,
      ping: async (): Promise<boolean> => true,
      zadd: async (): Promise<void> => undefined,
      ztop: async (): Promise<{ member: string; score: number }[]> => [],
    };
  }

  async function counterValue(metricName: string): Promise<number> {
    const metric = registry.getSingleMetric(metricName);
    if (!metric) return 0;
    const data = await metric.get();
    if (data.values.length === 0) return 0;
    return data.values[0]?.value ?? 0;
  }

  it('increments wikidata_cache_hits_total on a Redis cache hit', async () => {
    const provider = makeProvider();
    provider.lookup.mockResolvedValue(MONA);
    const cache = makeCacheStub({
      key: 'kb:wikidata:mona lisa',
      value: { facts: MONA },
    });
    const svc = new KnowledgeBaseService(provider, baseConfig, cache);

    const facts = await svc.lookupFacts('Mona Lisa');
    expect(facts).toEqual(MONA);
    expect(provider.lookup).not.toHaveBeenCalled();
    expect(await counterValue('wikidata_cache_hits_total')).toBe(1);
    expect(await counterValue('wikidata_cache_misses_total')).toBe(0);
  });

  it('increments wikidata_cache_misses_total when the cache is empty and provider is consulted', async () => {
    const provider = makeProvider();
    provider.lookup.mockResolvedValue(MONA);
    const cache = makeCacheStub();
    const svc = new KnowledgeBaseService(provider, baseConfig, cache);

    await svc.lookupFacts('Mona Lisa');
    expect(provider.lookup).toHaveBeenCalledTimes(1);
    expect(await counterValue('wikidata_cache_misses_total')).toBe(1);
    expect(await counterValue('wikidata_cache_hits_total')).toBe(0);
  });

  it('does NOT emit cache counters when no CacheService is wired', async () => {
    const provider = makeProvider();
    provider.lookup.mockResolvedValue(MONA);
    const svc = new KnowledgeBaseService(provider, baseConfig);

    await svc.lookupFacts('Mona Lisa');
    expect(await counterValue('wikidata_cache_hits_total')).toBe(0);
    expect(await counterValue('wikidata_cache_misses_total')).toBe(0);
  });

  it('increments wikidata_local_dump_hits_total when cascade triggered + dump returned facts', async () => {
    const provider = makeProvider();
    provider.lookup.mockResolvedValue(null);
    const dump = makeDump();
    dump.findFactsBySearchTerm.mockResolvedValue(DUMP_MONA);
    const openSince = Date.now() - (baseConfig.localDumpFallbackAfterMs + 1000);
    const svc = new KnowledgeBaseService(provider, baseConfig, undefined, {
      breakerState: () => ({ name: 'OPEN', openSince }),
      dumpRepo: dump,
    });

    await svc.lookupFacts('Mona Lisa');
    expect(await counterValue('wikidata_local_dump_hits_total')).toBe(1);
    expect(await counterValue('wikidata_local_dump_misses_total')).toBe(0);
  });

  it('increments wikidata_local_dump_misses_total when cascade triggered + dump returned null', async () => {
    const provider = makeProvider();
    provider.lookup.mockResolvedValue(null);
    const dump = makeDump();
    dump.findFactsBySearchTerm.mockResolvedValue(null);
    const openSince = Date.now() - (baseConfig.localDumpFallbackAfterMs + 1000);
    const svc = new KnowledgeBaseService(provider, baseConfig, undefined, {
      breakerState: () => ({ name: 'OPEN', openSince }),
      dumpRepo: dump,
    });

    await svc.lookupFacts('UnknownArt');
    expect(await counterValue('wikidata_local_dump_hits_total')).toBe(0);
    expect(await counterValue('wikidata_local_dump_misses_total')).toBe(1);
  });

  it('does NOT emit dump counters when cascade is NOT triggered (CLOSED)', async () => {
    const provider = makeProvider();
    provider.lookup.mockResolvedValue(null);
    const dump = makeDump();
    const svc = new KnowledgeBaseService(provider, baseConfig, undefined, {
      breakerState: () => ({ name: 'CLOSED' }),
      dumpRepo: dump,
    });

    await svc.lookupFacts('Mona Lisa');
    expect(dump.findFactsBySearchTerm).not.toHaveBeenCalled();
    expect(await counterValue('wikidata_local_dump_hits_total')).toBe(0);
    expect(await counterValue('wikidata_local_dump_misses_total')).toBe(0);
  });
});
