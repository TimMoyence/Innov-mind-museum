/**
 * T-A2 (RED — Wave A / C3 — UFR-022 fresh-context red phase 2026-05-21).
 *
 * Pins the `runIngest({ museumId, ... })` contract for the catalog-ingest CLI :
 * every `ArtworkEmbeddingRow` persisted MUST carry the tenant `museum_id`
 * passed via options (OWASP LLM08 — `findNearest` scopes by museum_id, so
 * ingest MUST write it ; today rows land with NULL museum_id no matter what).
 *
 * Current `RunIngestOptions` (museum-backend/scripts/catalog-ingest.ts:86-107)
 * exposes museumQids/licenseFilter/dryRun/batchSize/concurrency/lang/encoder/
 * repository/download/fetchArtworks — but **NO `museumId` field**. The CLI
 * `parseCliArgs` parses `--museum=`, `--from-csv=`, `--license-filter=`,
 * `--dry-run`, `--batch-size=`, `--concurrency=` — but **NO `--museum-id=`**.
 * Even when the operator targets one tenant museum, `ArtworkEmbeddingRow`
 * (catalog-ingest.ts:310-318) never sets `museumId`, so the DB column lands
 * `NULL` → row is treated as global public catalog → leaks across tenants
 * (LLM08 violation in B2B / multi-tenant scope).
 *
 * RED expectation: the `museumId` option is unknown to `RunIngestOptions` so
 * TypeScript fails to compile (`Object literal may only specify known
 * properties`) — that **is** the red signal here. Once the editor lands T-A8
 * (adds `museumId?: number | null` to `RunIngestOptions` + threads into row),
 * this test will pass.
 *
 * Test strategy : no DB. Mock encoder (deterministic Float32Array) + mock
 * repository (captures upsertBatch arguments) + mock fetch (SPARQL JSON +
 * tiny JPEG buffer). Verifies the IN-MEMORY shape of the row → fast,
 * hermetic. The integration-DB persistence path is covered transitively by
 * the existing `tests/integration/chat/visual-similarity/catalog-ingest.test.ts`
 * once the column wiring is in place ; THIS test pins the option contract.
 *
 * No factory file is created for `ArtworkEmbeddingRow` because the SUT
 * (runIngest) is the producer — we capture what it emits, not construct it.
 */
import { makePartialResponse, makeFetchSpy } from '../../helpers/fetch/fetch-mock.helpers';
import { EMBEDDING_DIM } from '../../helpers/chat/visual-similarity/embedding.fixtures';

import type { EmbeddingsPort } from '@modules/chat/domain/ports/embeddings.port';
import type {
  ArtworkEmbeddingRepository,
  ArtworkEmbeddingRow,
  UpsertBatchResult,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';

// Silence logger noise from the SUT during these tests.
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

/**
 * Local mirror of the SUT options shape — kept narrow so the **museumId**
 * field is what fails to compile when the SUT does not declare it. (Once
 * T-A8 lands the field in `RunIngestOptions`, the SUT cast below picks it up
 * and the test runs ; until then, the structural cast surfaces the gap.)
 */
interface RunIngestOptionsWithMuseumId {
  museumQids: string[];
  licenseFilter: ('public-domain' | 'cc-0' | 'cc-by-sa')[];
  dryRun?: boolean;
  batchSize?: number;
  concurrency?: number;
  lang?: string;
  encoder: EmbeddingsPort;
  repository: ArtworkEmbeddingRepository;
  /** T-A2 RED — option DOES NOT EXIST today on `RunIngestOptions`. */
  museumId?: number | null;
}

interface RunIngestResult {
  inserted: number;
  updated: number;
  skipped: number;
  licenseRejected: number;
  totalSeen: number;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load to surface a useful failure when options shape lacks museumId
const { runIngest } = require('../../../scripts/catalog-ingest') as {
  runIngest: (opts: RunIngestOptionsWithMuseumId) => Promise<RunIngestResult>;
};

const TENANT_MUSEUM_ID = 42;
const NUM_FIXTURE_ROWS = 5;
const originalFetch = global.fetch;

/**
 * Capturing mock for `ArtworkEmbeddingRepository.upsertBatch` — records every
 * row the SUT hands over so the test can assert on the tenant-scoping field.
 */
const makeCapturingRepo = (): ArtworkEmbeddingRepository & { captured: ArtworkEmbeddingRow[] } => {
  const captured: ArtworkEmbeddingRow[] = [];
  const repo = {
    upsertBatch: async (rows: ArtworkEmbeddingRow[]): Promise<UpsertBatchResult> => {
      captured.push(...rows);
      return { inserted: rows.length, updated: 0, skipped: 0 };
    },
    findNearest: async () => [],
    findByQid: async () => null,
    count: async () => captured.length,
    get captured(): ArtworkEmbeddingRow[] {
      return captured;
    },
  } as unknown as ArtworkEmbeddingRepository & { captured: ArtworkEmbeddingRow[] };
  return repo;
};

/** Deterministic encoder — vector orthogonal across calls. */
const makeMockEncoder = (): EmbeddingsPort => {
  let calls = 0;
  return {
    encode: async () => {
      const vector = new Float32Array(EMBEDDING_DIM);
      vector[calls % EMBEDDING_DIM] = 1;
      calls += 1;
      return { vector, modelVersion: 'siglip2-base-patch16-224@v1' };
    },
  } as unknown as EmbeddingsPort;
};

/**
 * Build a SPARQL JSON binding for one fixture row. URI for `license` mirrors
 * the corrected fixture in `catalog-ingest.helpers.test.ts` (T-A1) so this
 * test is consistent with the C2 mapping work happening in the same wave.
 *
 * Note : this fixture uses the slug `'public-domain'` for `license` (NOT a
 * URI) because `classifyLicense` currently compares slugs. Once T-A6 lands
 * the URI→slug mapper, this binding can swap to the URI form. The intent
 * here is to test museum_id propagation, not the license classifier path.
 */
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
    // Wikimedia thumbnail mock — tiny buffer, satisfies maxBytes check.
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
    const repo = makeCapturingRepo();
    const encoder = makeMockEncoder();

    const result = await runIngest({
      museumQids: ['Q3329534'],
      licenseFilter: ['public-domain', 'cc-0'],
      batchSize: 100,
      concurrency: 2,
      encoder,
      repository: repo,
      // RED — the SUT must accept this option AND propagate it to every row.
      museumId: TENANT_MUSEUM_ID,
    });

    expect(result.inserted).toBe(NUM_FIXTURE_ROWS);
    expect(repo.captured).toHaveLength(NUM_FIXTURE_ROWS);
    for (const row of repo.captured) {
      // Tenant scope MUST be propagated end-to-end.
      expect(row.museumId).toBe(TENANT_MUSEUM_ID);
    }
  });

  it('writes museumId=null when runIngest options omit museumId (global catalog branch)', async () => {
    const bindings = Array.from({ length: 2 }, (_, i) =>
      makeBinding(`Q${600_000 + i}`, `Public ${String(i)}`, 'Q19675'),
    );
    wireFetchMock(bindings);
    const repo = makeCapturingRepo();
    const encoder = makeMockEncoder();

    const result = await runIngest({
      museumQids: ['Q19675'],
      licenseFilter: ['public-domain', 'cc-0'],
      batchSize: 100,
      concurrency: 1,
      encoder,
      repository: repo,
      // museumId intentionally OMITTED — global public catalog branch.
    });

    expect(result.inserted).toBe(2);
    for (const row of repo.captured) {
      // ArtworkEmbeddingRow.museumId is `number | null | undefined` —
      // accept both nullish encodings (the repository persists null in
      // either case, see artwork_embeddings.museum_id column nullable).
      expect(row.museumId ?? null).toBeNull();
    }
  });
});
