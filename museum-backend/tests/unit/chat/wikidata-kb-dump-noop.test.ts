import { NoopWikidataKbDumpRepository } from '@modules/chat/domain/ports/wikidata-kb-dump.port';

describe('NoopWikidataKbDumpRepository', () => {
  const repo = new NoopWikidataKbDumpRepository();

  it('resolves to null for any search term (skeleton — ingest deferred)', async () => {
    expect(await repo.findFactsBySearchTerm('Mona Lisa')).toBeNull();
    expect(await repo.findFactsBySearchTerm('La Joconde', 'fr')).toBeNull();
    expect(await repo.findFactsBySearchTerm('')).toBeNull();
  });
});
