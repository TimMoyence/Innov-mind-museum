import {
  EMBEDDING_DIM,
  countArtworkEmbeddings,
  makeArtworkEmbeddingRow,
  makeNormalisedFloat32,
  makeNormalisedVectorLiteral,
} from '../../../helpers/chat/visual-similarity/embedding.fixtures';
import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';

import type {
  ArtworkEmbeddingRepository,
  ArtworkEmbeddingRow,
  UpsertBatchResult,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';

const { ArtworkEmbeddingRepositoryPg } =
  require('@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg') as {
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

  const buildFixtureRows = (
    count: number,
    museumQid: string | null = 'Q19675',
  ): ArtworkEmbeddingRow[] =>
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
      embeddingModelVersion: 'siglip2-base-patch16-224@v1',
    }));

  it('upserts a 100-row batch and reports inserted=100, updated=0, skipped=0', async () => {
    const rows = buildFixtureRows(NUM_FIXTURE_ROWS);
    const result: UpsertBatchResult = await repo.upsertBatch(rows);

    expect(result.inserted).toBe(NUM_FIXTURE_ROWS);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(await countArtworkEmbeddings(harness.dataSource)).toBe(NUM_FIXTURE_ROWS);
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

    const query = makeNormalisedFloat32(0, EMBEDDING_DIM);
    const nearest = await repo.findNearest(query, 5);

    expect(nearest).toHaveLength(5);
    expect(nearest[0].qid).toBe('Q100000');
    expect(nearest[0].visualScore).toBeCloseTo(1, 3);
    for (let i = 1; i < nearest.length; i += 1) {
      expect(nearest[i].visualScore).toBeLessThanOrEqual(nearest[i - 1].visualScore);
    }
  });

  it('findNearest respects the museumQids filter (only returns rows in the allow-list)', async () => {
    const louvre = buildFixtureRows(50, 'Q19675');
    const orsay = buildFixtureRows(50, 'Q23402').map((row, i) => ({
      ...row,
      qid: `Q${200_000 + i}`,
    }));
    await repo.upsertBatch([...louvre, ...orsay]);

    const query = makeNormalisedFloat32(0, EMBEDDING_DIM);
    const nearest = await repo.findNearest(query, 10, { museumQids: ['Q23402'] });

    expect(nearest.length).toBeGreaterThan(0);
    for (const result of nearest) {
      expect(result.metadata.museumQid).toBe('Q23402');
    }
  });

  it('findByQid returns a hydrated entity for an existing row', async () => {
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
    expect(await countArtworkEmbeddings(harness.dataSource)).toBe(0);
    await repo.upsertBatch(buildFixtureRows(10));
    expect(await countArtworkEmbeddings(harness.dataSource)).toBe(10);
  });
});
