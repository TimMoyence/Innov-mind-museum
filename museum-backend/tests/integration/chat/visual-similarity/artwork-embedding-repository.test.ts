/**
 * RED — T4.5 — `ArtworkEmbeddingRepositoryPg` (integration, pgvector).
 *
 * Locks down tasks.md T4.5 + design.md §3 / §9 D2:
 *   - `upsertBatch` is idempotent (rows on second batch are detected as
 *     skipped/updated, never re-inserted),
 *   - `findNearest` returns rows in inner-product ascending order
 *     (highest similarity first), with `visualScore` mapped into `[0, 1]`,
 *   - the optional `museumQids` filter respects the allow-list,
 *   - `findByQid` and `count` are wired correctly.
 *
 * Uses the shared integration harness (`createIntegrationHarness()`) which
 * spins up a `pgvector/pgvector:pg16` container and applies all migrations.
 *
 * SUT does not yet exist (Phase 4). Tests are RED until the editor lands the
 * repository file.
 */

import {
  EMBEDDING_DIM,
  makeArtworkEmbeddingRow,
  makeNormalisedFloat32,
  makeNormalisedVectorLiteral,
} from '../../../helpers/chat/visual-similarity/embedding.fixtures';
import { createIntegrationHarness } from '../../../helpers/integration/integration-harness';

import type {
  ArtworkEmbeddingRepository,
  ArtworkEmbeddingRow,
  UpsertBatchResult,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';

// SUT — Phase 4 file, must not yet exist.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load
const { ArtworkEmbeddingRepositoryPg } = require('@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg') as {
  ArtworkEmbeddingRepositoryPg: new (
    dataSource: import('typeorm').DataSource,
  ) => ArtworkEmbeddingRepository;
};

const NUM_FIXTURE_ROWS = 100;

describe('ArtworkEmbeddingRepositoryPg (T4.5 — integration)', () => {
  let harness: Awaited<ReturnType<typeof createIntegrationHarness>>;
  let repo: ArtworkEmbeddingRepository;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    repo = new ArtworkEmbeddingRepositoryPg(harness.dataSource);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  /**
   * Build N deterministic catalog rows. The first row's vector matches
   * `seedIndex=0` so a query vector with the same seed gives similarity ≈ 1.
   * Each subsequent row uses an orthogonal seed, guaranteeing predictable
   * inner-product ordering when comparing against `seedIndex=0`.
   */
  const buildFixtureRows = (count: number, museumQid: string | null = 'Q19675'): ArtworkEmbeddingRow[] =>
    Array.from({ length: count }, (_, i) => ({
      qid: `Q${100_000 + i}`,
      vector: makeNormalisedFloat32(i, EMBEDDING_DIM),
      metadata: {
        title: `Fixture artwork ${i}`,
        imageUrl: `https://upload.wikimedia.org/fixture/${i}.jpg`,
        ...(museumQid ? { museumQid } : {}),
      },
      imageSource: 'wikimedia' as const,
      license: 'public-domain' as const,
      embeddingModelVersion: 'siglip-base-patch16-224@v1',
    }));

  it('upserts a 100-row batch and reports inserted=100, updated=0, skipped=0', async () => {
    const rows = buildFixtureRows(NUM_FIXTURE_ROWS);
    const result: UpsertBatchResult = await repo.upsertBatch(rows);

    expect(result.inserted).toBe(NUM_FIXTURE_ROWS);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(await repo.count()).toBe(NUM_FIXTURE_ROWS);
  });

  it('upsertBatch second pass over identical rows reports skipped=100, inserted=0', async () => {
    const rows = buildFixtureRows(NUM_FIXTURE_ROWS);
    await repo.upsertBatch(rows);

    const second = await repo.upsertBatch(rows);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(NUM_FIXTURE_ROWS);
    expect(second.updated).toBe(0);
  });

  it('findNearest returns top-K ordered by similarity descending; closest match has similarity ≈ 1', async () => {
    const rows = buildFixtureRows(NUM_FIXTURE_ROWS);
    await repo.upsertBatch(rows);

    const query = makeNormalisedFloat32(0, EMBEDDING_DIM); // identical to row 0
    const nearest = await repo.findNearest(query, 5);

    expect(nearest).toHaveLength(5);
    expect(nearest[0].qid).toBe('Q100000');
    expect(nearest[0].visualScore).toBeCloseTo(1, 3);
    // Sanity: scores are monotonically non-increasing.
    for (let i = 1; i < nearest.length; i += 1) {
      expect(nearest[i].visualScore).toBeLessThanOrEqual(nearest[i - 1].visualScore);
    }
  });

  it('findNearest respects the museumQids filter (only returns rows in the allow-list)', async () => {
    const louvre = buildFixtureRows(50, 'Q19675'); // first 50 rows → Louvre
    const orsay = buildFixtureRows(50, 'Q23402').map((row, i) => ({
      ...row,
      qid: `Q${200_000 + i}`,
    })); // distinct QIDs to avoid PK collision
    await repo.upsertBatch([...louvre, ...orsay]);

    const query = makeNormalisedFloat32(0, EMBEDDING_DIM);
    const nearest = await repo.findNearest(query, 10, { museumQids: ['Q23402'] });

    expect(nearest.length).toBeGreaterThan(0);
    for (const result of nearest) {
      expect(result.metadata.museumQid).toBe('Q23402');
    }
  });

  it('findByQid returns a hydrated entity for an existing row', async () => {
    // Insert a single canonical Mona Lisa row via the raw helper so the test
    // also exercises the entity-mapping path, not just upsertBatch's return.
    const fixture = makeArtworkEmbeddingRow({ embedding: makeNormalisedVectorLiteral(0) });
    await harness.dataSource.query(
      `INSERT INTO artwork_embeddings (qid, museum_qid, title, image_url, license, image_source, embedding, embedding_model_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7::halfvec, $8)`,
      [
        fixture.qid,
        fixture.museum_qid,
        fixture.title,
        fixture.image_url,
        fixture.license,
        fixture.image_source,
        fixture.embedding,
        fixture.embedding_model_version,
      ],
    );

    const found = await repo.findByQid(fixture.qid);
    expect(found).not.toBeNull();
    expect(found?.qid).toBe(fixture.qid);
    expect(found?.title).toBe(fixture.title);
  });

  it('findByQid returns null for a missing row', async () => {
    const found = await repo.findByQid('Q-does-not-exist');
    expect(found).toBeNull();
  });

  it('count returns the total number of rows in the catalog', async () => {
    expect(await repo.count()).toBe(0);
    await repo.upsertBatch(buildFixtureRows(10));
    expect(await repo.count()).toBe(10);
  });
});
