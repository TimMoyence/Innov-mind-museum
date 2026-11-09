import { WikidataWriteThroughProvider } from '@modules/chat/adapters/secondary/search/wikidata-write-through.provider';
import { makeArtworkFacts } from 'tests/helpers/chat/visual-similarity/artwork-facts.fixtures';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { WikidataKbDumpRepositoryPort } from '@modules/chat/domain/ports/wikidata-kb-dump.port';

const MONA: ArtworkFacts = makeArtworkFacts();
const QUERY: KnowledgeBaseQuery = { searchTerm: 'Mona Lisa' };
const QUERY_FR: KnowledgeBaseQuery = { searchTerm: 'La Joconde', language: 'fr' };

interface InnerStub extends KnowledgeBaseProvider {
  lookup: jest.Mock<Promise<ArtworkFacts | null>, [KnowledgeBaseQuery]>;
}
interface DumpStub extends WikidataKbDumpRepositoryPort {
  findFactsBySearchTerm: jest.Mock<Promise<ArtworkFacts | null>, [string, string?]>;
  upsert: jest.Mock<Promise<void>, [string, string | undefined, ArtworkFacts]>;
}

function makeInner(): InnerStub {
  return { lookup: jest.fn() };
}
function makeDump(): DumpStub {
  return {
    findFactsBySearchTerm: jest.fn<Promise<ArtworkFacts | null>, [string, string?]>(
      async () => null,
    ),
    upsert: jest.fn<Promise<void>, [string, string | undefined, ArtworkFacts]>(
      async () => undefined,
    ),
  };
}

const flushMicrotasks = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('WikidataWriteThroughProvider', () => {
  it('delegates lookup to the inner provider transparently', async () => {
    const inner = makeInner();
    inner.lookup.mockResolvedValue(MONA);
    const dump = makeDump();
    const provider = new WikidataWriteThroughProvider(inner, dump);

    const result = await provider.lookup(QUERY);

    expect(result).toEqual(MONA);
    expect(inner.lookup).toHaveBeenCalledWith(QUERY);
  });

  it('UPSERTs facts on a non-null result (searchTerm + language passed through)', async () => {
    const inner = makeInner();
    inner.lookup.mockResolvedValue(MONA);
    const dump = makeDump();
    const provider = new WikidataWriteThroughProvider(inner, dump);

    await provider.lookup(QUERY_FR);
    await flushMicrotasks();

    expect(dump.upsert).toHaveBeenCalledTimes(1);
    expect(dump.upsert).toHaveBeenCalledWith('La Joconde', 'fr', MONA);
  });

  it('does NOT UPSERT when the inner provider returns null', async () => {
    const inner = makeInner();
    inner.lookup.mockResolvedValue(null);
    const dump = makeDump();
    const provider = new WikidataWriteThroughProvider(inner, dump);

    const result = await provider.lookup(QUERY);
    await flushMicrotasks();

    expect(result).toBeNull();
    expect(dump.upsert).not.toHaveBeenCalled();
  });

  it('is fire-and-forget — lookup returns before UPSERT resolves', async () => {
    const inner = makeInner();
    inner.lookup.mockResolvedValue(MONA);
    const dump = makeDump();

    let resolveUpsert: (() => void) | undefined;
    dump.upsert.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveUpsert = resolve;
      }),
    );

    const provider = new WikidataWriteThroughProvider(inner, dump);

    const lookupAwait = provider.lookup(QUERY);
    const result = await lookupAwait;
    expect(result).toEqual(MONA);
    expect(dump.upsert).toHaveBeenCalledTimes(1);

    resolveUpsert?.();
    await flushMicrotasks();
  });

  it('propagates inner-provider throws verbatim (no swallow on read path)', async () => {
    const inner = makeInner();
    const boom = new Error('inner_failure');
    inner.lookup.mockRejectedValue(boom);
    const dump = makeDump();
    const provider = new WikidataWriteThroughProvider(inner, dump);

    await expect(provider.lookup(QUERY)).rejects.toBe(boom);
    expect(dump.upsert).not.toHaveBeenCalled();
  });

  it('swallows UPSERT failures so the lookup path is never poisoned', async () => {
    const inner = makeInner();
    inner.lookup.mockResolvedValue(MONA);
    const dump = makeDump();
    dump.upsert.mockRejectedValue(new Error('db_unreachable'));
    const provider = new WikidataWriteThroughProvider(inner, dump);

    const result = await provider.lookup(QUERY);
    await flushMicrotasks();

    expect(result).toEqual(MONA);
  });
});
