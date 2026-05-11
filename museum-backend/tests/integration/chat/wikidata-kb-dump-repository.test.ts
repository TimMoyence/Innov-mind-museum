/**
 * C5.3 Phase A — `WikidataKbDumpRepositoryTypeOrm` integration test.
 *
 * Round-trips through a real Postgres testcontainer (shared harness in
 * `tests/helpers/integration/integration-harness.ts`) so the migration,
 * the UNIQUE constraint, the JSONB serialisation, and the language sentinel
 * are exercised together. Unit-level tests are deliberately skipped because
 * the whole value of this class lies in its SQL semantics — mocking the
 * underlying `Repository` would test nothing meaningful.
 */

import { WikidataKbDumpRepositoryTypeOrm } from '@modules/chat/adapters/secondary/persistence/wikidata-kb-dump.repository.typeorm';
import { WikidataKbDump } from '@modules/chat/domain/knowledge/wikidata-kb-dump.entity';
import { makeArtworkFacts } from 'tests/helpers/chat/visual-similarity/artwork-facts.fixtures';
import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

const MONA: ArtworkFacts = makeArtworkFacts();
const VENUS: ArtworkFacts = makeArtworkFacts({
  qid: 'Q3914',
  title: 'Vénus de Milo',
  artist: 'Unknown',
  date: 'c. 100 BC',
});

describe('WikidataKbDumpRepositoryTypeOrm (C5.3 — integration)', () => {
  let harness: Awaited<ReturnType<typeof createIntegrationHarness>>;
  let repo: WikidataKbDumpRepositoryTypeOrm;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    repo = new WikidataKbDumpRepositoryTypeOrm(harness.dataSource);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  describe('upsert + findFactsBySearchTerm round-trip', () => {
    it('writes a row and reads it back identically', async () => {
      await repo.upsert('Mona Lisa', undefined, MONA);

      const facts = await repo.findFactsBySearchTerm('Mona Lisa');
      expect(facts).toEqual(MONA);
    });

    it('normalises the search term (case-insensitive, trim)', async () => {
      await repo.upsert('  Mona Lisa  ', undefined, MONA);

      // Read with different casing + extra whitespace — must resolve the same row.
      expect(await repo.findFactsBySearchTerm('mona lisa')).toEqual(MONA);
      expect(await repo.findFactsBySearchTerm('MONA LISA')).toEqual(MONA);
      expect(await repo.findFactsBySearchTerm('  Mona   Lisa  ')).toBeNull(); // collapsed-spaces NOT normalised — only outer trim
      expect(await repo.findFactsBySearchTerm('Mona Lisa')).toEqual(MONA);
    });

    it('treats undefined language as the empty-string sentinel', async () => {
      await repo.upsert('Mona Lisa', undefined, MONA);
      expect(await repo.findFactsBySearchTerm('Mona Lisa', '')).toEqual(MONA);
      expect(await repo.findFactsBySearchTerm('Mona Lisa', undefined)).toEqual(MONA);
    });

    it('separates rows by language', async () => {
      const monaFr: ArtworkFacts = { ...MONA, title: 'La Joconde' };
      await repo.upsert('Mona Lisa', undefined, MONA);
      await repo.upsert('Mona Lisa', 'fr', monaFr);

      expect(await repo.findFactsBySearchTerm('Mona Lisa')).toEqual(MONA);
      expect(await repo.findFactsBySearchTerm('Mona Lisa', 'fr')).toEqual(monaFr);
      expect(await repo.findFactsBySearchTerm('Mona Lisa', 'de')).toBeNull();
    });
  });

  describe('upsert idempotency + collision behaviour', () => {
    it('does not create duplicate rows on repeated upsert with same key', async () => {
      await repo.upsert('Mona Lisa', undefined, MONA);
      await repo.upsert('Mona Lisa', undefined, MONA);
      await repo.upsert('Mona Lisa', undefined, MONA);

      const tableRepo = harness.dataSource.getRepository(WikidataKbDump);
      const count = await tableRepo.count({ where: { searchTerm: 'mona lisa' } });
      expect(count).toBe(1);
    });

    it('updates the facts payload when the row already exists', async () => {
      await repo.upsert('Mona Lisa', undefined, MONA);

      const updated: ArtworkFacts = { ...MONA, technique: 'Oil on linen (test update)' };
      await repo.upsert('Mona Lisa', undefined, updated);

      expect(await repo.findFactsBySearchTerm('Mona Lisa')).toEqual(updated);
    });
  });

  describe('empty / missing inputs', () => {
    it('returns null for an empty search term (no DB hit)', async () => {
      expect(await repo.findFactsBySearchTerm('')).toBeNull();
      expect(await repo.findFactsBySearchTerm('   ')).toBeNull();
    });

    it('returns null for a missing entry', async () => {
      expect(await repo.findFactsBySearchTerm('Nonexistent Artwork')).toBeNull();
    });

    it('upsert with empty search term is a swallowed no-op', async () => {
      await expect(repo.upsert('', undefined, MONA)).resolves.toBeUndefined();
      await expect(repo.upsert('   ', undefined, MONA)).resolves.toBeUndefined();

      const tableRepo = harness.dataSource.getRepository(WikidataKbDump);
      expect(await tableRepo.count()).toBe(0);
    });
  });

  describe('multi-row catalog behaviour', () => {
    it('returns each artwork independently after a batch of upserts', async () => {
      await repo.upsert('Mona Lisa', undefined, MONA);
      await repo.upsert('Vénus de Milo', undefined, VENUS);

      expect(await repo.findFactsBySearchTerm('mona lisa')).toEqual(MONA);
      expect(await repo.findFactsBySearchTerm('VÉNUS DE MILO')).toEqual(VENUS);
    });

    it('denormalises facts.qid into the indexed column for reverse lookup', async () => {
      await repo.upsert('Mona Lisa', undefined, MONA);

      const tableRepo = harness.dataSource.getRepository(WikidataKbDump);
      const row = await tableRepo.findOne({ where: { searchTerm: 'mona lisa' } });
      expect(row?.qid).toBe('Q12418');
    });
  });
});
