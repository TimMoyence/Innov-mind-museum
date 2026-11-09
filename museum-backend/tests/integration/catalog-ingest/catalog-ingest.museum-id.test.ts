import { makePartialResponse, makeFetchSpy } from '../../helpers/fetch/fetch-mock.helpers';
import {
  makeCapturingEmbeddingRepo,
  makeStubEncoder,
} from '../../helpers/chat/visual-similarity/catalog-ingest.fixtures';

import type { EmbeddingsPort } from '@modules/chat/domain/ports/embeddings.port';
import type { ArtworkEmbeddingRepository } from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

interface RunIngestOptionsWithMuseumId {
  museumQids: string[];
  licenseFilter: ('public-domain' | 'cc-0' | 'cc-by-sa')[];
  dryRun?: boolean;
  batchSize?: number;
  concurrency?: number;
  lang?: string;
  encoder: EmbeddingsPort;
  repository: ArtworkEmbeddingRepository;
  museumId?: number | null;
}

interface RunIngestResult {
  inserted: number;
  updated: number;
  skipped: number;
  licenseRejected: number;
  totalSeen: number;
}

const { runIngest } = require('../../../scripts/catalog-ingest') as {
  runIngest: (opts: RunIngestOptionsWithMuseumId) => Promise<RunIngestResult>;
};

const TENANT_MUSEUM_ID = 42;
const NUM_FIXTURE_ROWS = 5;
const originalFetch = global.fetch;

const makeBinding = (
  qid: string,
  title: string,
  museumQid: string,
): Record<string, { value: string }> => ({
  item: { value: `http://www.wikidata.org/entity/${qid}` },
  itemLabel: { value: title },
  image: {
    value: `http://commons.wikimedia.org/wiki/Special:FilePath/${qid}.jpg`,
  },
  license: { value: 'public-domain' },
  museum: { value: `http://www.wikidata.org/entity/${museumQid}` },
});

const wireFetchMock = (bindings: Record<string, { value: string }>[]): void => {
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
};

describe('catalog-ingest CLI museum_id scoping (T-A2 — Wave A C3)', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('writes museumId=42 on every persisted row when runIngest({museumId:42, ...})', async () => {
    const bindings = Array.from({ length: NUM_FIXTURE_ROWS }, (_, i) =>
      makeBinding(`Q${500_000 + i}`, `Fixture ${String(i)}`, 'Q3329534'),
    );
    wireFetchMock(bindings);
    const repo = makeCapturingEmbeddingRepo();
    const encoder = makeStubEncoder();

    const result = await runIngest({
      museumQids: ['Q3329534'],
      licenseFilter: ['public-domain', 'cc-0'],
      batchSize: 100,
      concurrency: 2,
      encoder,
      repository: repo,
      museumId: TENANT_MUSEUM_ID,
    });

    expect(result.inserted).toBe(NUM_FIXTURE_ROWS);
    expect(repo.captured).toHaveLength(NUM_FIXTURE_ROWS);
    for (const row of repo.captured) {
      expect(row.museumId).toBe(TENANT_MUSEUM_ID);
    }
  });

  it('writes museumId=null when runIngest options omit museumId (global catalog branch)', async () => {
    const bindings = Array.from({ length: 2 }, (_, i) =>
      makeBinding(`Q${600_000 + i}`, `Public ${String(i)}`, 'Q19675'),
    );
    wireFetchMock(bindings);
    const repo = makeCapturingEmbeddingRepo();
    const encoder = makeStubEncoder();

    const result = await runIngest({
      museumQids: ['Q19675'],
      licenseFilter: ['public-domain', 'cc-0'],
      batchSize: 100,
      concurrency: 1,
      encoder,
      repository: repo,
    });

    expect(result.inserted).toBe(2);
    for (const row of repo.captured) {
      expect(row.museumId ?? null).toBeNull();
    }
  });
});
