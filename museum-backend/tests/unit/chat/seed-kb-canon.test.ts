/**
 * C5.3 Phase A — `seedKbCanon` unit test.
 *
 * Exercises the testable core of the `scripts/seed-kb-canon.ts` CLI :
 * counter accuracy, dry-run skip, error resilience (the loop must NEVER
 * short-circuit on a single bad term), and the (term × language) cartesian
 * product expansion. The CLI entry point itself (DataSource init, env
 * parsing) is intentionally untested — its surface is process-shaped and
 * the meaningful logic lives entirely in this function.
 */

import {
  DEFAULT_CANON_LANGUAGES,
  DEFAULT_CANON_TERMS,
  seedKbCanon,
} from '@modules/chat/useCase/knowledge/seed-kb-canon';
import { makeArtworkFacts } from 'tests/helpers/chat/visual-similarity/artwork-facts.fixtures';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { WikidataKbDumpRepositoryPort } from '@modules/chat/domain/ports/wikidata-kb-dump.port';

const MONA: ArtworkFacts = makeArtworkFacts();
const VENUS: ArtworkFacts = makeArtworkFacts({ qid: 'Q3914', title: 'Vénus de Milo' });

function makeClient(): KnowledgeBaseProvider & { lookup: jest.Mock } {
  return { lookup: jest.fn() };
}
function makeRepo(): WikidataKbDumpRepositoryPort & {
  upsert: jest.Mock;
  findFactsBySearchTerm: jest.Mock;
} {
  return {
    findFactsBySearchTerm: jest.fn(async () => null),
    upsert: jest.fn(async () => undefined),
  };
}

describe('seedKbCanon', () => {
  it('expands (terms × languages) into a cartesian sweep and UPSERTs each hit', async () => {
    const client = makeClient();
    client.lookup.mockResolvedValue(MONA);
    const repo = makeRepo();

    const result = await seedKbCanon({
      client,
      repo,
      terms: ['Mona Lisa', 'Vénus de Milo'],
      languages: ['en', 'fr'],
    });

    expect(result.total).toBe(4);
    expect(result.attempted).toBe(4);
    expect(result.hits).toBe(4);
    expect(result.upserted).toBe(4);
    expect(result.errors).toBe(0);
    expect(client.lookup).toHaveBeenCalledTimes(4);
    expect(repo.upsert).toHaveBeenCalledTimes(4);
    expect(repo.upsert).toHaveBeenCalledWith('Mona Lisa', 'en', MONA);
    expect(repo.upsert).toHaveBeenCalledWith('Mona Lisa', 'fr', MONA);
    expect(repo.upsert).toHaveBeenCalledWith('Vénus de Milo', 'en', MONA);
    expect(repo.upsert).toHaveBeenCalledWith('Vénus de Milo', 'fr', MONA);
  });

  it('skips UPSERT when the provider returns null (counts as attempt, not hit)', async () => {
    const client = makeClient();
    client.lookup.mockImplementation(async ({ searchTerm }) =>
      searchTerm === 'Mona Lisa' ? MONA : null,
    );
    const repo = makeRepo();

    const result = await seedKbCanon({
      client,
      repo,
      terms: ['Mona Lisa', 'Unknown Artwork'],
      languages: ['en'],
    });

    expect(result.attempted).toBe(2);
    expect(result.hits).toBe(1);
    expect(result.upserted).toBe(1);
    expect(result.errors).toBe(0);
    expect(repo.upsert).toHaveBeenCalledTimes(1);
    expect(repo.upsert).toHaveBeenCalledWith('Mona Lisa', 'en', MONA);
  });

  it('dry-run logs the hit but does not call upsert', async () => {
    const client = makeClient();
    client.lookup.mockResolvedValue(MONA);
    const repo = makeRepo();

    const result = await seedKbCanon({
      client,
      repo,
      terms: ['Mona Lisa'],
      languages: ['en', 'fr'],
      dryRun: true,
    });

    expect(result.hits).toBe(2);
    expect(result.upserted).toBe(0);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('does NOT short-circuit when one provider call throws — counts and continues', async () => {
    const client = makeClient();
    client.lookup
      .mockResolvedValueOnce(MONA)                // term1/en — hit
      .mockRejectedValueOnce(new Error('boom'))   // term1/fr — error
      .mockResolvedValueOnce(VENUS)               // term2/en — hit
      .mockResolvedValueOnce(null);               // term2/fr — miss
    const repo = makeRepo();

    const result = await seedKbCanon({
      client,
      repo,
      terms: ['Mona Lisa', 'Vénus de Milo'],
      languages: ['en', 'fr'],
    });

    expect(result.attempted).toBe(4);
    expect(result.hits).toBe(2);
    expect(result.upserted).toBe(2);
    expect(result.errors).toBe(1);
    expect(client.lookup).toHaveBeenCalledTimes(4);
  });

  it('counts a repo upsert throw as an error without aborting the loop', async () => {
    const client = makeClient();
    client.lookup.mockResolvedValue(MONA);
    const repo = makeRepo();
    repo.upsert
      .mockResolvedValueOnce(undefined)        // en — ok
      .mockRejectedValueOnce(new Error('db')); // fr — error

    const result = await seedKbCanon({
      client,
      repo,
      terms: ['Mona Lisa'],
      languages: ['en', 'fr'],
    });

    expect(result.hits).toBe(2);
    expect(result.upserted).toBe(1);
    expect(result.errors).toBe(1);
  });

  it('exports a non-empty canon term + language defaults', () => {
    expect(DEFAULT_CANON_TERMS.length).toBeGreaterThanOrEqual(40);
    expect(DEFAULT_CANON_TERMS).toContain('Mona Lisa');
    expect(DEFAULT_CANON_TERMS).toContain('Vénus de Milo');
    expect(DEFAULT_CANON_LANGUAGES).toEqual(['en', 'fr']);
  });
});
