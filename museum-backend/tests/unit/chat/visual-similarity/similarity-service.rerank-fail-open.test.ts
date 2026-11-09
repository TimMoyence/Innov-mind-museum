import { makeCache } from '../../../helpers/chat/cache.fixtures';
import { makeArtworkFacts } from '../../../helpers/chat/visual-similarity/artwork-facts.fixtures';
import { makeSiglipJpegBuffer } from '../../../helpers/chat/visual-similarity/image-fixtures';
import {
  makeArtworkMetadata,
  makeEncodeOutput,
  makeNearestResult,
} from '../../../helpers/chat/visual-similarity/compare.fixtures';

import { RerankerUnavailableError } from '@modules/chat/domain/ports/reranker.port';

import type { RerankResult, RerankerPort } from '@modules/chat/domain/ports/reranker.port';
import type { EmbeddingsPort, EncodeOutput } from '@modules/chat/domain/ports/embeddings.port';
import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';
import type {
  ArtworkEmbeddingRepository,
  FindNearestOptions,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';
import type {
  CompareResult,
  NearestResult,
} from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { CacheService } from '@shared/cache/cache.port';

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
  museumQids?: string[];
  museumId?: number | null;
  queryText?: string;
}

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

function makeFactsMap(neighbours: NearestResult[]): Map<string, ArtworkFacts> {
  const out = new Map<string, ArtworkFacts>();
  for (const n of neighbours) {
    out.set(n.qid, makeArtworkFacts({ qid: n.qid, title: n.metadata.title }));
  }
  return out;
}

function buildMocks(neighbours: NearestResult[] = makeNeighbours(20)): {
  encoder: jest.Mocked<EmbeddingsPort>;
  repo: jest.Mocked<ArtworkEmbeddingRepository>;
  enricher: { enrichBatch: jest.Mock<Promise<Map<string, ArtworkFacts>>, [string[], string]> };
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
  };
  const enricher = {
    enrichBatch: jest
      .fn<Promise<Map<string, ArtworkFacts>>, [string[], string]>()
      .mockImplementation(async (qids: string[]) =>
        makeFactsMap(neighbours.filter((n) => qids.includes(n.qid))),
      ),
  };
  const cache = makeCache();
  const reranker: jest.Mocked<RerankerPort> = {
    rerank: jest.fn(),
  };
  return { encoder, repo, enricher, cache, reranker };
}

describe('VisualSimilarityService — rerank fail-open (C9.13)', () => {
  let buffer: Buffer;

  beforeAll(async () => {
    buffer = await makeSiglipJpegBuffer();
  });

  beforeEach(() => {});

  it('does NOT call reranker when queryText is undefined (V1 default)', async () => {
    const { encoder, repo, enricher, cache, reranker } = buildMocks();
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

    expect(result.matches.length).toBeGreaterThan(0);
    expect(reranker.rerank).not.toHaveBeenCalled();
  });

  it('reorders matches when queryText is set AND reranker returns a permutation', async () => {
    const { encoder, repo, enricher, cache, reranker } = buildMocks();
    const rerankReturn: RerankResult[] = [
      { docIndex: 3, score: 0.95 },
      { docIndex: 0, score: 0.7 },
    ];
    reranker.rerank.mockResolvedValueOnce(rerankReturn);

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
      queryText: 'mona lisa portrait',
    });

    expect(reranker.rerank).toHaveBeenCalledTimes(1);
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
    expect(result.matches[0]?.qid).toBe('Q1003');
    expect(result.matches[1]?.qid).toBe('Q1000');
  });

  it('preserves fused-score ordering when reranker throws RerankerUnavailableError', async () => {
    const { encoder, repo, enricher, cache, reranker } = buildMocks();
    reranker.rerank.mockRejectedValueOnce(
      new RerankerUnavailableError('disabled by configuration'),
    );

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
      queryText: 'mona lisa portrait',
    });

    expect(result.matches[0]?.qid).toBe('Q1000');
    expect(reranker.rerank).toHaveBeenCalledTimes(1);
  });
});
