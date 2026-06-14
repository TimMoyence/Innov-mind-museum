/**
 * VisualSimilarityService — enrichment failure is isolated (never 500s).
 *
 * Regression (prod incident 2026-06-14): the SigLIP encoder fix let
 * `/chat/compare` reach the post-kNN path for the first time. In prod
 * `WikidataClient.lookup` threw (egress/DNS/SSRF block); the throw propagated
 * out of `enrichBatch` (Promise.all) and out of `compare()` — HTTP 500. The
 * encoder-absent 503 had masked this latent bug for the lifetime of the feature.
 *
 * This is the END-TO-END guard: a REAL WikidataEnricher whose client throws on
 * every lookup must NOT make `compare()` reject. The per-qid try/catch inside
 * the enricher turns each lookup throw into a Map gap, so enrichBatch resolves,
 * scoreAndPackage drops the un-enriched neighbours, and compare returns the
 * contractual `no_visual_neighbor` response (HTTP 200) instead of a 500.
 */

import { makeCache } from '../../../helpers/chat/cache.fixtures';
import { makeArtworkFacts } from '../../../helpers/chat/visual-similarity/artwork-facts.fixtures';
import { makeSiglipJpegBuffer } from '../../../helpers/chat/visual-similarity/image-fixtures';
import {
  makeArtworkMetadata,
  makeEncodeOutput,
  makeNearestResult,
} from '../../../helpers/chat/visual-similarity/compare.fixtures';

import { WikidataEnricher } from '@modules/chat/useCase/visual-similarity/wikidata-enricher';
import { getLangfuse } from '@shared/observability/langfuse.client';

import type { EmbeddingsPort, EncodeOutput } from '@modules/chat/domain/ports/embeddings.port';
import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';
import type { RerankerPort } from '@modules/chat/domain/ports/reranker.port';
import type {
  ArtworkEmbeddingRepository,
  FindNearestOptions,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';
import type {
  CompareResult,
  NearestResult,
} from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { CacheService } from '@shared/cache/cache.port';

jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: jest.fn(() => null),
}));

interface VsCtorArgs {
  encoder: EmbeddingsPort;
  repo: ArtworkEmbeddingRepository;
  enricher: { enrichBatch: (qids: string[], lang: string) => Promise<Map<string, ArtworkFacts>> };
  cache: CacheService;
  reranker: RerankerPort;
  weights: { wVisual: number; wMeta: number };
  topN?: number;
  topK?: number;
}

interface CompareInput {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  topK: number;
  locale: 'fr' | 'en';
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load mirrors sibling rerank-fail-open spec
const { VisualSimilarityService } =
  require('@modules/chat/useCase/visual-similarity/similarity.service') as {
    VisualSimilarityService: new (args: VsCtorArgs) => {
      compare: (input: CompareInput) => Promise<CompareResult>;
    };
  };

function makeNeighbours(n: number): NearestResult[] {
  return Array.from({ length: n }, (_, i) =>
    makeNearestResult({
      qid: `Q${1000 + i}`,
      visualScore: Math.max(0, 1 - i * 0.01),
      metadata: makeArtworkMetadata({
        title: `Artwork ${i}`,
        imageUrl: `https://commons.wikimedia.org/img/${i}.jpg`,
      }),
    }),
  );
}

function buildMocks(neighbours: NearestResult[]): {
  encoder: jest.Mocked<EmbeddingsPort>;
  repo: jest.Mocked<ArtworkEmbeddingRepository>;
  cache: jest.Mocked<CacheService>;
  reranker: jest.Mocked<RerankerPort>;
} {
  const encoder: jest.Mocked<EmbeddingsPort> = {
    encode: jest
      .fn<Promise<EncodeOutput>, [Parameters<EmbeddingsPort['encode']>[0]]>()
      .mockResolvedValue(makeEncodeOutput()),
  };
  const repo: jest.Mocked<ArtworkEmbeddingRepository> = {
    findNearest: jest
      .fn<Promise<NearestResult[]>, [Float32Array, number, FindNearestOptions?]>()
      .mockResolvedValue(neighbours),
    upsertBatch: jest.fn(),
    findByQid: jest.fn(),
    count: jest.fn(),
  };
  const cache = makeCache();
  const reranker: jest.Mocked<RerankerPort> = { rerank: jest.fn() };
  return { encoder, repo, cache, reranker };
}

describe('VisualSimilarityService — enrichment failure isolated (prod 2026-06-14 regression)', () => {
  let buffer: Buffer;

  beforeAll(async () => {
    buffer = await makeSiglipJpegBuffer();
  });

  beforeEach(() => {
    (getLangfuse as jest.MockedFunction<typeof getLangfuse>).mockReturnValue(null);
  });

  it("does NOT 500 when the REAL enricher's client.lookup throws on every qid", async () => {
    const neighbours = makeNeighbours(5);
    const { encoder, repo, cache, reranker } = buildMocks(neighbours);

    // Real WikidataEnricher + a client that throws like prod's blocked egress.
    const throwingLookup = jest
      .fn<Promise<ArtworkFacts | null>, [{ searchTerm: string; language?: string }]>()
      .mockRejectedValue(new Error('ENOTFOUND wikidata.org (prod egress block)'));
    const enricher = new WikidataEnricher({
      client: { lookup: throwingLookup },
      cache: makeCache(),
    });

    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      reranker,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    // MUST resolve — a rejection here is the prod 500 under test.
    const result = await service.compare({
      buffer,
      mimeType: 'image/jpeg',
      topK: 5,
      locale: 'fr',
    });

    // Every lookup was attempted (and threw) — the enricher isolated each one.
    expect(throwingLookup).toHaveBeenCalled();
    // All enrichment dropped → no matches → contractual no_visual_neighbor (200).
    expect(result.fallbackReason).toBe('no_visual_neighbor');
    expect(result.matches).toEqual([]);
    // Contract the smoke asserts on a 200 response: a non-empty modelVersion.
    expect(typeof result.modelVersion).toBe('string');
    expect(result.modelVersion.length).toBeGreaterThan(0);
  });

  it('still returns matches when only SOME lookups throw (partial enrichment survives)', async () => {
    const neighbours = makeNeighbours(5);
    const { encoder, repo, cache, reranker } = buildMocks(neighbours);

    // Throws for one qid, resolves facts for the rest — partial failure.
    const partialLookup = jest
      .fn<Promise<ArtworkFacts | null>, [{ searchTerm: string; language?: string }]>()
      .mockImplementation(async ({ searchTerm }) => {
        if (searchTerm === 'Q1002') throw new Error('transient Wikidata 503');
        return makeArtworkFacts({ qid: searchTerm, title: `Title ${searchTerm}` });
      });
    const enricher = new WikidataEnricher({
      client: { lookup: partialLookup },
      cache: makeCache(),
    });

    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      reranker,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    const result = await service.compare({
      buffer,
      mimeType: 'image/jpeg',
      topK: 5,
      locale: 'fr',
    });

    // The 4 successfully-enriched neighbours still produce matches.
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.some((m) => m.qid === 'Q1002')).toBe(false); // the throwing qid dropped
  });
});
