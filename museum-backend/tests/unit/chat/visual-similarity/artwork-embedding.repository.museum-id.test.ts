import type {
  ArtworkEmbeddingRepository,
  FindNearestOptions,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';
import type { DataSource } from 'typeorm';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { ArtworkEmbeddingRepositoryPg } =
  require('@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg') as {
    ArtworkEmbeddingRepositoryPg: new (dataSource: DataSource) => ArtworkEmbeddingRepository;
  };

const { logger: mockLogger } = require('@shared/logger/logger') as {
  logger: { warn: jest.Mock; info: jest.Mock; error: jest.Mock };
};

function buildDataSourceMock(): {
  ds: DataSource;
  query: jest.Mock;
} {
  const query = jest.fn().mockResolvedValue([]);
  const ds = { query } as unknown as DataSource;
  return { ds, query };
}

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
    expect(params[3]).toBe(42);
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
