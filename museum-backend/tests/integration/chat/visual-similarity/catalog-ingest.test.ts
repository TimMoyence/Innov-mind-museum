import { makePartialResponse, makeFetchSpy } from '../../../helpers/fetch/fetch-mock.helpers';
import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';
import { makeStubEncoder } from '../../../helpers/chat/visual-similarity/catalog-ingest.fixtures';
import { countArtworkEmbeddings } from '../../../helpers/chat/visual-similarity/embedding.fixtures';

import type { EmbeddingsPort } from '@modules/chat/domain/ports/embeddings.port';
import type { ArtworkEmbeddingRepository } from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

interface RunIngestOptions {
  museumQids: string[];
  licenseFilter: ('public-domain' | 'cc-0' | 'cc-by-sa')[];
  dryRun?: boolean;
  batchSize?: number;
  concurrency?: number;
  encoder: EmbeddingsPort;
  repository: ArtworkEmbeddingRepository;
}

interface RunIngestResult {
  inserted: number;
  updated: number;
  skipped: number;
  licenseRejected: number;
  totalSeen: number;
}

const { runIngest } = require('../../../../scripts/catalog-ingest') as {
  runIngest: (opts: RunIngestOptions) => Promise<RunIngestResult>;
};

const NUM_FIXTURE_ROWS = 100;
const originalFetch = global.fetch;

const makeBinding = (
  qid: string,
  title: string,
  license: 'public-domain' | 'cc-0' | 'cc-by-sa',
  museumQid = 'Q19675',
): Record<string, { value: string }> => ({
  item: { value: `http://www.wikidata.org/entity/${qid}` },
  itemLabel: { value: title },
  image: {
    value: `http://commons.wikimedia.org/wiki/Special:FilePath/${qid}.jpg`,
  },
  license: { value: license },
  museum: { value: `http://www.wikidata.org/entity/${museumQid}` },
});

const wireFetchMock = (
  bindings: Record<string, { value: string }>[],
): jest.MockedFunction<typeof fetch> => {
  const spy = makeFetchSpy();
  spy.mockImplementation((input: Parameters<typeof fetch>[0]) => {
    const url = typeof input === 'string' ? input : (input as URL | Request).toString();
    if (url.includes('query.wikidata.org/sparql')) {
      return Promise.resolve(
        makePartialResponse({
          ok: true,
          status: 200,
          body: { results: { bindings } },
        }),
      );
    }
    const fakeJpeg = Buffer.alloc(1024, 0x42);
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: {
        get: (k: string) =>
          k.toLowerCase() === 'content-length' ? String(fakeJpeg.byteLength) : null,
        has: (k: string) => k.toLowerCase() === 'content-length',
      },
      arrayBuffer: () => Promise.resolve(fakeJpeg.buffer),
    } as unknown as Response);
  });
  global.fetch = spy;
  return spy;
};

describe('catalog-ingest CLI (T7.1 — integration)', () => {
  let harness: Awaited<ReturnType<typeof createIntegrationHarness>>;
  let repo: ArtworkEmbeddingRepository;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    const { ArtworkEmbeddingRepositoryPg } =
      require('@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg') as {
        ArtworkEmbeddingRepositoryPg: new (
          ds: import('typeorm').DataSource,
        ) => ArtworkEmbeddingRepository;
      };
    repo = new ArtworkEmbeddingRepositoryPg(harness.dataSource);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('happy path: 100 SPARQL fixtures → 100 rows inserted in artwork_embeddings', async () => {
    const bindings = Array.from({ length: NUM_FIXTURE_ROWS }, (_, i) =>
      makeBinding(`Q${500_000 + i}`, `Fixture ${i}`, 'public-domain'),
    );
    wireFetchMock(bindings);
    const encoder = makeStubEncoder();

    const result = await runIngest({
      museumQids: ['Q19675'],
      licenseFilter: ['public-domain', 'cc-0'],
      batchSize: 100,
      concurrency: 4,
      encoder,
      repository: repo,
    });

    expect(result.inserted).toBe(NUM_FIXTURE_ROWS);
    expect(result.skipped).toBe(0);
    expect(result.licenseRejected).toBe(0);
    expect(await countArtworkEmbeddings(harness.dataSource)).toBe(NUM_FIXTURE_ROWS);
  });

  it('R15 idempotency: rerun over the same DB state produces 0 inserts (skipped=100)', async () => {
    const bindings = Array.from({ length: NUM_FIXTURE_ROWS }, (_, i) =>
      makeBinding(`Q${500_000 + i}`, `Fixture ${i}`, 'public-domain'),
    );

    wireFetchMock(bindings);
    await runIngest({
      museumQids: ['Q19675'],
      licenseFilter: ['public-domain', 'cc-0'],
      batchSize: 100,
      concurrency: 4,
      encoder: makeStubEncoder(),
      repository: repo,
    });
    expect(await countArtworkEmbeddings(harness.dataSource)).toBe(NUM_FIXTURE_ROWS);

    wireFetchMock(bindings);
    const second = await runIngest({
      museumQids: ['Q19675'],
      licenseFilter: ['public-domain', 'cc-0'],
      batchSize: 100,
      concurrency: 4,
      encoder: makeStubEncoder(),
      repository: repo,
    });

    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(NUM_FIXTURE_ROWS);
    expect(await countArtworkEmbeddings(harness.dataSource)).toBe(NUM_FIXTURE_ROWS);
  });

  it('license-filter=pd,cc-0 rejects cc-by-sa rows (60 PD + 30 CC-0 + 10 CC-BY-SA → 90 inserted, 10 rejected)', async () => {
    const bindings = [
      ...Array.from({ length: 60 }, (_, i) =>
        makeBinding(`Q${600_000 + i}`, `PD ${i}`, 'public-domain'),
      ),
      ...Array.from({ length: 30 }, (_, i) => makeBinding(`Q${700_000 + i}`, `CC-0 ${i}`, 'cc-0')),
      ...Array.from({ length: 10 }, (_, i) =>
        makeBinding(`Q${800_000 + i}`, `CC-BY-SA ${i}`, 'cc-by-sa'),
      ),
    ];
    wireFetchMock(bindings);

    const result = await runIngest({
      museumQids: ['Q19675'],
      licenseFilter: ['public-domain', 'cc-0'],
      batchSize: 100,
      concurrency: 4,
      encoder: makeStubEncoder(),
      repository: repo,
    });

    expect(result.inserted).toBe(90);
    expect(result.licenseRejected).toBe(10);
    expect(await countArtworkEmbeddings(harness.dataSource)).toBe(90);
  });

  it('--dry-run performs zero DB writes (preview-only)', async () => {
    const bindings = Array.from({ length: NUM_FIXTURE_ROWS }, (_, i) =>
      makeBinding(`Q${900_000 + i}`, `Dry ${i}`, 'public-domain'),
    );
    wireFetchMock(bindings);

    const result = await runIngest({
      museumQids: ['Q19675'],
      licenseFilter: ['public-domain', 'cc-0'],
      dryRun: true,
      batchSize: 100,
      concurrency: 4,
      encoder: makeStubEncoder(),
      repository: repo,
    });

    expect(result.inserted).toBe(0);
    expect(await countArtworkEmbeddings(harness.dataSource)).toBe(0);
    expect(result.totalSeen).toBe(NUM_FIXTURE_ROWS);
  });

  it('honours --batch-size=20 --concurrency=2 on 100 fixtures (no race, no double-insert)', async () => {
    const bindings = Array.from({ length: NUM_FIXTURE_ROWS }, (_, i) =>
      makeBinding(`Q${950_000 + i}`, `Batch ${i}`, 'public-domain'),
    );
    wireFetchMock(bindings);

    const result = await runIngest({
      museumQids: ['Q19675'],
      licenseFilter: ['public-domain', 'cc-0'],
      batchSize: 20,
      concurrency: 2,
      encoder: makeStubEncoder(),
      repository: repo,
    });

    expect(result.inserted).toBe(NUM_FIXTURE_ROWS);
    expect(await countArtworkEmbeddings(harness.dataSource)).toBe(NUM_FIXTURE_ROWS);
  });
});
