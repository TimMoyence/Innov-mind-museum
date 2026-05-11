import { KnowledgeBaseService } from '@modules/chat/useCase/knowledge/knowledge-base.service';

import type { BreakerState } from '@modules/chat/adapters/secondary/search/wikidata-breaker';
import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { WikidataKbDumpRepositoryPort } from '@modules/chat/domain/ports/wikidata-kb-dump.port';

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
