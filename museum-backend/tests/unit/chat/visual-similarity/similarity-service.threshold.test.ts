import { makeCache } from '../../../helpers/chat/cache.fixtures';
import { makeArtworkFacts } from '../../../helpers/chat/visual-similarity/artwork-facts.fixtures';
import { makeSiglipJpegBuffer } from '../../../helpers/chat/visual-similarity/image-fixtures';
import {
  makeArtworkMetadata,
  makeEncodeOutput,
  makeNearestResult,
} from '../../../helpers/chat/visual-similarity/compare.fixtures';

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

interface VisualSimilarityServiceCtorArgs {
  encoder: EmbeddingsPort;
  repo: ArtworkEmbeddingRepository;
  enricher: { enrichBatch: (qids: string[], lang: string) => Promise<Map<string, ArtworkFacts>> };
  cache: CacheService;
  weights: { wVisual: number; wMeta: number };
  topN?: number;
  topK?: number;
  fallbackVisualThreshold?: number;
}

interface CompareInput {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  topK: number;
  locale: 'fr' | 'en';
  museumQids?: string[];
  museumId?: number | null;
}

const { VisualSimilarityService } =
  require('@modules/chat/useCase/visual-similarity/similarity.service') as {
    VisualSimilarityService: new (args: VisualSimilarityServiceCtorArgs) => {
      compare: (input: CompareInput) => Promise<CompareResult>;
    };
  };

const SCORE_AS_VISUAL = { wVisual: 1, wMeta: 0 } as const;

function makeNeighboursWithScores(scores: number[]): NearestResult[] {
  return scores.map((score, i) =>
    makeNearestResult({
      qid: `Q${2000 + i}`,
      visualScore: score,
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

function buildMocks(neighbours: NearestResult[]): {
  encoder: jest.Mocked<EmbeddingsPort>;
  repo: jest.Mocked<ArtworkEmbeddingRepository>;
  enricher: { enrichBatch: jest.Mock<Promise<Map<string, ArtworkFacts>>, [string[], string]> };
  cache: jest.Mocked<CacheService>;
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
  return { encoder, repo, enricher, cache };
}

const DEFAULT_INPUT: Omit<CompareInput, 'buffer'> = {
  mimeType: 'image/jpeg',
  topK: 5,
  locale: 'fr',
};

const THRESHOLD = 0.4;

describe('VisualSimilarityService.compare — D-03 score floor (fallbackVisualThreshold)', () => {
  let buffer: Buffer;

  beforeAll(async () => {
    buffer = await makeSiglipJpegBuffer();
  });

  it('T-D03-3 — every neighbour above the floor → all returned (sorted, capped at topK)', async () => {
    const neighbours = makeNeighboursWithScores([0.9, 0.8, 0.7, 0.6, 0.5]);
    const { encoder, repo, enricher, cache } = buildMocks(neighbours);
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: SCORE_AS_VISUAL,
      fallbackVisualThreshold: THRESHOLD,
    });

    const result = await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(result.matches).toHaveLength(5);
    expect(result.fallbackReason).toBeUndefined();
    for (const m of result.matches) {
      expect(m.finalScore).toBeGreaterThanOrEqual(THRESHOLD);
    }
  });

  it('T-D03-2 — mixed scores → only matches >= floor are returned, sub-floor ones excluded', async () => {
    const neighbours = makeNeighboursWithScores([0.9, 0.6, 0.39, 0.2, 0.05]);
    const { encoder, repo, enricher, cache } = buildMocks(neighbours);
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: SCORE_AS_VISUAL,
      fallbackVisualThreshold: THRESHOLD,
    });

    const result = await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(result.matches).toHaveLength(2);
    expect(result.fallbackReason).toBeUndefined();
    for (const m of result.matches) {
      expect(m.finalScore).toBeGreaterThanOrEqual(THRESHOLD);
    }
    const returnedScores = result.matches.map((m) => m.finalScore);
    expect(returnedScores).not.toContain(0.39);
    expect(returnedScores).not.toContain(0.2);
    expect(returnedScores).not.toContain(0.05);
  });

  it('T-D03-1 — all neighbours below the floor → matches=[] + fallbackReason="no_visual_neighbor"', async () => {
    const neighbours = makeNeighboursWithScores([0.39, 0.3, 0.2, 0.1, 0.05]);
    const { encoder, repo, enricher, cache } = buildMocks(neighbours);
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: SCORE_AS_VISUAL,
      fallbackVisualThreshold: THRESHOLD,
    });

    const result = await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(result.matches).toEqual([]);
    expect(result.fallbackReason).toBe('no_visual_neighbor');
    expect(repo.findNearest).toHaveBeenCalledTimes(1);
  });

  it('T-D03-4 — score exactly == floor is INCLUSIVE (>=, not >)', async () => {
    const neighbours = makeNeighboursWithScores([THRESHOLD, 0.39]);
    const { encoder, repo, enricher, cache } = buildMocks(neighbours);
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: SCORE_AS_VISUAL,
      fallbackVisualThreshold: THRESHOLD,
    });

    const result = await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.finalScore).toBe(THRESHOLD);
    expect(result.fallbackReason).toBeUndefined();
  });

  it('T-D03 — configurable floor: a higher threshold (0.65) excludes more matches', async () => {
    const neighbours = makeNeighboursWithScores([0.9, 0.7, 0.5, 0.45, 0.3]);
    const { encoder, repo, enricher, cache } = buildMocks(neighbours);
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: SCORE_AS_VISUAL,
      fallbackVisualThreshold: 0.65,
    });

    const result = await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(result.matches).toHaveLength(2);
    for (const m of result.matches) {
      expect(m.finalScore).toBeGreaterThanOrEqual(0.65);
    }
  });

  it('T-D03 — configurable floor: a permissive threshold (0) returns everything', async () => {
    const neighbours = makeNeighboursWithScores([0.39, 0.2, 0.05]);
    const { encoder, repo, enricher, cache } = buildMocks(neighbours);
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: SCORE_AS_VISUAL,
      fallbackVisualThreshold: 0,
    });

    const result = await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(result.matches).toHaveLength(3);
    expect(result.fallbackReason).toBeUndefined();
  });

  it('T-D03-5 — threshold absent (legacy deps) → default 0.4 applied', async () => {
    const neighbours = makeNeighboursWithScores([0.8, 0.5, 0.39, 0.1]);
    const { encoder, repo, enricher, cache } = buildMocks(neighbours);
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: SCORE_AS_VISUAL,
    });

    const result = await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(result.matches).toHaveLength(2);
    for (const m of result.matches) {
      expect(m.finalScore).toBeGreaterThanOrEqual(0.4);
    }
  });
});
