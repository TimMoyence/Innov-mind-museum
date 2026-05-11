import { NoopWikidataKbDumpRepository } from '@modules/chat/domain/ports/wikidata-kb-dump.port';

describe('NoopWikidataKbDumpRepository', () => {
  const repo = new NoopWikidataKbDumpRepository();

  it('resolves to null for any search term (skeleton — ingest deferred)', async () => {
    expect(await repo.findFactsBySearchTerm('Mona Lisa')).toBeNull();
    expect(await repo.findFactsBySearchTerm('La Joconde', 'fr')).toBeNull();
    expect(await repo.findFactsBySearchTerm('')).toBeNull();
  });

  it('upsert is a swallowed no-op (write-through contract preserved)', async () => {
    // The Noop is wired in chat-module today ; the write-through decorator
    // (`WikidataWriteThroughProvider`) will fire-and-forget upserts against
    // it. The Noop MUST swallow without throwing so the chat path is never
    // poisoned by a missing persistence layer.
    await expect(
      repo.upsert('Mona Lisa', undefined, { qid: 'Q12418', title: 'Mona Lisa' }),
    ).resolves.toBeUndefined();
    await expect(
      repo.upsert('La Joconde', 'fr', { qid: 'Q12418', title: 'La Joconde' }),
    ).resolves.toBeUndefined();
  });
});
