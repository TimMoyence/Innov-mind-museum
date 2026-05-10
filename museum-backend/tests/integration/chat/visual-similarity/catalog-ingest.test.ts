/**
 * RED — T7.1 — `catalog-ingest` CLI (integration, real PG + mocked SPARQL/HTTP).
 *
 * Locks down tasks.md T7.1 + spec.md R15 (idempotency) + design.md §9 D8:
 *   - 100 fixtures happy path → 100 rows inserted in `artwork_embeddings`,
 *   - second run on the same DB → 0 inserts (skipped because qid + modelVersion
 *     already present — R15 idempotency),
 *   - `--license-filter=pd,cc-0` rejects rows whose license falls outside the
 *     allow-list and surfaces a `license_rejected` count,
 *   - `--dry-run` performs no DB write,
 *   - `--batch-size=20 --concurrency=2` works (no race / no double-insert).
 *
 * SPARQL + Wikimedia downloads are mocked via `global.fetch`; the encoder is
 * mocked to return a deterministic 768-d vector so the test remains
 * hermetic (no ONNX / no network).
 *
 * SUT does not yet exist (Phase 7). Tests are RED until the editor lands the
 * `museum-backend/scripts/catalog-ingest.ts` file with a `runIngest(opts)`
 * test-friendly entry point.
 */

import { makePartialResponse, makeFetchSpy } from '../../../helpers/fetch/fetch-mock.helpers';
import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';
import { EMBEDDING_DIM } from '../../../helpers/chat/visual-similarity/embedding.fixtures';

import type { EmbeddingsPort } from '@modules/chat/domain/ports/embeddings.port';
import type { ArtworkEmbeddingRepository } from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';

// Silence logger noise from the SUT during these tests.
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

/**
 * Runtime options for the test-friendly SUT entry. The CLI real binary parses
 * `process.argv`; tests bypass argv parsing and call `runIngest(opts)`
 * directly so we can inject mocked dependencies (encoder + repository) and
 * mocked HTTP for SPARQL / Wikimedia.
 */
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

// SUT — Phase 7 file, must not yet exist. Path is relative to the test
// file because `scripts/` lives outside the `src/` tree (no path alias).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load to surface a useful Jest failure when the module is missing
const { runIngest } = require('../../../../scripts/catalog-ingest') as {
  runIngest: (opts: RunIngestOptions) => Promise<RunIngestResult>;
};

const NUM_FIXTURE_ROWS = 100;
const originalFetch = global.fetch;

/**
 * Build a deterministic mocked encoder. The vector for index `i` has its
 * `i`-th component set to 1, every other to 0 — orthogonal across rows so
 * future findNearest assertions stay well-defined.
 */
const makeMockEncoder = (): EmbeddingsPort & { calls: number } => {
  let calls = 0;
  const encoder = {
    encode: async () => {
      const idx = calls;
      calls += 1;
      const vector = new Float32Array(EMBEDDING_DIM);
      vector[idx % EMBEDDING_DIM] = 1;
      return {
        vector,
        modelVersion: 'siglip-base-patch16-224@v1',
      };
    },
    get calls() {
      return calls;
    },
  } as unknown as EmbeddingsPort & { calls: number };
  return encoder;
};

/**
 * Build a SPARQL JSON binding. Optional fields are omitted from the binding
 * dictionary so the SUT defensively handles missing keys.
 */
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

/**
 * Wire `global.fetch` so:
 *  - any URL containing `query.wikidata.org/sparql` returns the supplied
 *    bindings array,
 *  - any other URL (i.e. Wikimedia thumbnail) returns a tiny deterministic
 *    JPEG-shaped buffer.
 */
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
    // Mock Wikimedia thumbnail download — ~1KB random buffer is enough; the
    // SUT preprocesses + encodes via the injected mocked encoder.
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
    // Repository wiring uses the real Phase 4 adapter — same module the
    // CLI itself uses in production.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT-coupled adapter load
    const { ArtworkEmbeddingRepositoryPg } = require('@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg') as {
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
    const encoder = makeMockEncoder();

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
    expect(await repo.count()).toBe(NUM_FIXTURE_ROWS);
  });

  it('R15 idempotency: rerun over the same DB state produces 0 inserts (skipped=100)', async () => {
    const bindings = Array.from({ length: NUM_FIXTURE_ROWS }, (_, i) =>
      makeBinding(`Q${500_000 + i}`, `Fixture ${i}`, 'public-domain'),
    );

    // First run — populates the catalog.
    wireFetchMock(bindings);
    await runIngest({
      museumQids: ['Q19675'],
      licenseFilter: ['public-domain', 'cc-0'],
      batchSize: 100,
      concurrency: 4,
      encoder: makeMockEncoder(),
      repository: repo,
    });
    expect(await repo.count()).toBe(NUM_FIXTURE_ROWS);

    // Second run — same SPARQL response, same encoder seeds, same model version.
    wireFetchMock(bindings);
    const second = await runIngest({
      museumQids: ['Q19675'],
      licenseFilter: ['public-domain', 'cc-0'],
      batchSize: 100,
      concurrency: 4,
      encoder: makeMockEncoder(),
      repository: repo,
    });

    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(NUM_FIXTURE_ROWS);
    expect(await repo.count()).toBe(NUM_FIXTURE_ROWS);
  });

  it('license-filter=pd,cc-0 rejects cc-by-sa rows (60 PD + 30 CC-0 + 10 CC-BY-SA → 90 inserted, 10 rejected)', async () => {
    const bindings = [
      ...Array.from({ length: 60 }, (_, i) =>
        makeBinding(`Q${600_000 + i}`, `PD ${i}`, 'public-domain'),
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        makeBinding(`Q${700_000 + i}`, `CC-0 ${i}`, 'cc-0'),
      ),
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
      encoder: makeMockEncoder(),
      repository: repo,
    });

    expect(result.inserted).toBe(90);
    expect(result.licenseRejected).toBe(10);
    expect(await repo.count()).toBe(90);
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
      encoder: makeMockEncoder(),
      repository: repo,
    });

    expect(result.inserted).toBe(0);
    expect(await repo.count()).toBe(0);
    // The CLI still reports what *would* have been inserted in dry-run.
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
      encoder: makeMockEncoder(),
      repository: repo,
    });

    expect(result.inserted).toBe(NUM_FIXTURE_ROWS);
    expect(await repo.count()).toBe(NUM_FIXTURE_ROWS);
  });
});
