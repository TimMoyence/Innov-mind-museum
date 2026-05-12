/**
 * Unit — `ArtworkEmbeddingRepositoryPg.findNearest()` OWASP LLM08 tenant scope.
 *
 * Locks down the museum_id (internal tenant axis) wiring shipped with
 * migration `1778622760826-AddMuseumIdScopeToArtworkEmbeddings`:
 *
 *   - When `opts.museumId` is a positive integer → the SQL carries the
 *     `museum_id IS NULL OR museum_id = $4` predicate, the 4th bind parameter
 *     is the tenant id, and NO warn is logged.
 *   - When `opts.museumId` is omitted / null → the SQL passes `null` as the
 *     4th bind (predicate degenerates to a no-op via `$4 IS NULL`), and the
 *     repository logs `artwork_embeddings_find_nearest_unscoped` (warn).
 *
 * The integration test in `tests/integration/chat/visual-similarity/`
 * exercises the real pgvector binding behind a testcontainer; this unit
 * suite mocks `DataSource.query` so it runs without Docker and pins the
 * exact SQL shape + bind parameter ordering.
 */

import type {
  ArtworkEmbeddingRepository,
  FindNearestOptions,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';
import type { DataSource } from 'typeorm';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/* eslint-disable @typescript-eslint/no-require-imports -- dynamic SUT load + mock access after jest.mock hoisting (matches the convention used by every test in this folder) */
const { ArtworkEmbeddingRepositoryPg } =
  require('@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg') as {
    ArtworkEmbeddingRepositoryPg: new (dataSource: DataSource) => ArtworkEmbeddingRepository;
  };

const { logger: mockLogger } = require('@shared/logger/logger') as {
  logger: { warn: jest.Mock; info: jest.Mock; error: jest.Mock };
};
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Build a minimal `DataSource` test double whose only purpose is to capture
 * the SQL + bind parameters passed to `query()`. The kNN result is fixed at
 * an empty array so the SUT does no row hydration.
 * @returns The test double + a reference to its `query` jest.Mock for assertions.
 */
function buildDataSourceMock(): {
  ds: DataSource;
  query: jest.Mock;
} {
  const query = jest.fn().mockResolvedValue([]);
  // The repository only touches `query` on the read path.
  const ds = { query } as unknown as DataSource;
  return { ds, query };
}

/** L2-normalised dummy query vector (length 4 — the repo never checks). */
const QUERY = new Float32Array([0.5, 0.5, 0.5, 0.5]);

describe('ArtworkEmbeddingRepositoryPg.findNearest — OWASP LLM08 museum_id scope', () => {
  beforeEach(() => {
    mockLogger.warn.mockClear();
  });

  it('binds the tenant id as the 4th param and forwards the WHERE clause when museumId is set', async () => {
    const { ds, query } = buildDataSourceMock();
    const repo = new ArtworkEmbeddingRepositoryPg(ds);

    const opts: FindNearestOptions = { museumId: 42 };
    await repo.findNearest(QUERY, 5, opts);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain('($4::integer IS NULL OR museum_id IS NULL OR museum_id = $4::integer)');
    // Param order: [vectorLiteral, museumQids|null, topN, museumId|null].
    expect(params[3]).toBe(42);
    // The unscoped warn MUST stay silent when the scope is provided.
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('emits the unscoped warn AND binds null as the 4th param when museumId is omitted', async () => {
    const { ds, query } = buildDataSourceMock();
    const repo = new ArtworkEmbeddingRepositoryPg(ds);

    await repo.findNearest(QUERY, 5);

    expect(query).toHaveBeenCalledTimes(1);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[3]).toBeNull();

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [event, ctx] = mockLogger.warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe('artwork_embeddings_find_nearest_unscoped');
    expect(ctx).toEqual(expect.objectContaining({ topN: 5 }));
  });

  it('emits the unscoped warn when museumId is explicit null (treated as undefined)', async () => {
    const { ds, query } = buildDataSourceMock();
    const repo = new ArtworkEmbeddingRepositoryPg(ds);

    const opts: FindNearestOptions = { museumId: null };
    await repo.findNearest(QUERY, 5, opts);

    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[3]).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });

  it('forwards museumQids and museumId together — both filters appear in the SQL', async () => {
    const { ds, query } = buildDataSourceMock();
    const repo = new ArtworkEmbeddingRepositoryPg(ds);

    await repo.findNearest(QUERY, 5, {
      museumQids: ['Q19675'],
      museumId: 7,
    });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('museum_qid = ANY($2::text[])');
    expect(sql).toContain('museum_id = $4::integer');
    expect(params[1]).toEqual(['Q19675']);
    expect(params[3]).toBe(7);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});
