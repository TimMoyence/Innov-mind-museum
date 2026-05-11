/**
 * C5.3 Phase A — `WikidataWriteThroughProvider` decorator unit tests.
 *
 * Validates the contract documented in the class JSDoc :
 *   - Reads delegate transparently to the inner provider.
 *   - Non-null results trigger a fire-and-forget UPSERT (caller returns
 *     before the UPSERT resolves — verified with a delayed mock).
 *   - Null results do NOT trigger an UPSERT.
 *   - Inner throws propagate verbatim ; the decorator is not a swallow layer
 *     for upstream errors (the breaker beneath this layer handles those).
 *   - UPSERT throws are swallowed so the chat path never sees them.
 */

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

/** Yield to the microtask queue so fire-and-forget promises settle. */
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

    // Hold the upsert open with a manual resolver.
    let resolveUpsert: (() => void) | undefined;
    dump.upsert.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveUpsert = resolve;
      }),
    );

    const provider = new WikidataWriteThroughProvider(inner, dump);

    const lookupAwait = provider.lookup(QUERY);
    // The lookup MUST resolve even though the upsert is still pending.
    const result = await lookupAwait;
    expect(result).toEqual(MONA);
    // The upsert was kicked off, just not awaited.
    expect(dump.upsert).toHaveBeenCalledTimes(1);

    // Release the upsert so jest does not warn about open handles.
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
    // The lookup must succeed even when the persist layer is broken — this is
    // the defense-in-depth `.catch` inside `persistAsync` doing its job.
  });
});
