import { makeCache } from '../../../helpers/chat/cache.fixtures';
import { makeArtworkFacts } from '../../../helpers/chat/visual-similarity/artwork-facts.fixtures';
import { makeSiglipJpegBuffer } from '../../../helpers/chat/visual-similarity/image-fixtures';
import {
  DEFAULT_MODEL_VERSION,
  makeArtworkMetadata,
  makeEncodeOutput,
  makeNearestResult,
} from '../../../helpers/chat/visual-similarity/compare.fixtures';

import { EncoderUnavailableError } from '@modules/chat/domain/ports/embeddings.port';

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

describe('VisualSimilarityService.compare (T5.3 — orchestrator)', () => {
  let buffer: Buffer;

  beforeAll(async () => {
    buffer = await makeSiglipJpegBuffer();
  });

  it('R1 — happy path: encodes, searches, enriches, fuses, and returns top-K matches sorted by finalScore desc', async () => {
    const { encoder, repo, enricher, cache } = buildMocks();
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    const result = await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(encoder.encode).toHaveBeenCalledTimes(1);
    expect(repo.findNearest).toHaveBeenCalledTimes(1);
    expect(enricher.enrichBatch).toHaveBeenCalledTimes(1);

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.length).toBeLessThanOrEqual(DEFAULT_INPUT.topK);
    expect(result.modelVersion).toBe(DEFAULT_MODEL_VERSION);

    for (let i = 1; i < result.matches.length; i += 1) {
      const prev = result.matches[i - 1];
      const curr = result.matches[i];
      expect(prev?.finalScore).toBeGreaterThanOrEqual(curr?.finalScore ?? 0);
    }

    for (const m of result.matches) {
      expect(typeof m.rationale).toBe('string');
      expect(m.rationale.length).toBeGreaterThan(0);
      expect(m.visualScore).toBeGreaterThanOrEqual(0);
      expect(m.visualScore).toBeLessThanOrEqual(1);
      expect(m.finalScore).toBeGreaterThanOrEqual(0);
      expect(m.finalScore).toBeLessThanOrEqual(1);
    }
  });

  it('R3 — respects the requested topK (3) when ≥ topN candidates are available', async () => {
    const { encoder, repo, enricher, cache } = buildMocks(makeNeighbours(20));
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    const result = await service.compare({ ...DEFAULT_INPUT, buffer, topK: 3 });

    expect(result.matches.length).toBe(3);
  });

  it('R3 — calls repo.findNearest with topN ≥ max(20, 4 * topK)', async () => {
    const { encoder, repo, enricher, cache } = buildMocks(makeNeighbours(40));
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    await service.compare({ ...DEFAULT_INPUT, buffer, topK: 10 });

    const [, topN] = repo.findNearest.mock.calls[0] ?? [];
    expect(topN).toBeGreaterThanOrEqual(40);
  });

  it('R4 — forwards the museumQids filter to repo.findNearest', async () => {
    const { encoder, repo, enricher, cache } = buildMocks();
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    const museumQids = ['Q19675', 'Q23402'];
    await service.compare({ ...DEFAULT_INPUT, buffer, museumQids });

    const [, , opts] = repo.findNearest.mock.calls[0] ?? [];
    expect(opts).toEqual(expect.objectContaining({ museumQids }));
  });

  it('LLM08 — forwards the museumId tenant scope to repo.findNearest when set', async () => {
    const { encoder, repo, enricher, cache } = buildMocks();
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    await service.compare({ ...DEFAULT_INPUT, buffer, museumId: 42 });

    const [, , opts] = repo.findNearest.mock.calls[0] ?? [];
    expect(opts).toEqual(expect.objectContaining({ museumId: 42 }));
  });

  it('LLM08 — does NOT set museumId on the repo opts when input.museumId is undefined', async () => {
    const { encoder, repo, enricher, cache } = buildMocks();
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    await service.compare({ ...DEFAULT_INPUT, buffer });

    const [, , opts] = repo.findNearest.mock.calls[0] ?? [];
    expect(opts ?? {}).not.toHaveProperty('museumId');
  });

  it('LLM08 — null museumId is treated as unset (legacy global read)', async () => {
    const { encoder, repo, enricher, cache } = buildMocks();
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    await service.compare({ ...DEFAULT_INPUT, buffer, museumId: null });

    const [, , opts] = repo.findNearest.mock.calls[0] ?? [];
    expect(opts ?? {}).not.toHaveProperty('museumId');
  });

  it('LLM08 — cache key differs for distinct tenant ids (no cross-tenant cache poisoning)', async () => {
    const { encoder, repo, enricher, cache } = buildMocks();
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    await service.compare({ ...DEFAULT_INPUT, buffer, museumId: 1 });
    await service.compare({ ...DEFAULT_INPUT, buffer, museumId: 2 });

    expect(encoder.encode).toHaveBeenCalledTimes(2);
    expect(repo.findNearest).toHaveBeenCalledTimes(2);
  });

  it('R5 — calls encoder.encode with an L2-normalised vector and trusts that normalisation downstream', async () => {
    const { encoder, repo, enricher, cache } = buildMocks();
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    await service.compare({ ...DEFAULT_INPUT, buffer });

    const encodeOutput = await encoder.encode.mock.results[0]?.value;
    expect(encodeOutput).toBeDefined();
    const vec = (encodeOutput as EncodeOutput).vector;
    let sumSquares = 0;
    for (let i = 0; i < vec.length; i += 1) {
      sumSquares += (vec[i] ?? 0) ** 2;
    }
    expect(Math.sqrt(sumSquares)).toBeCloseTo(1, 6);
  });

  it('R10 — empty repo neighbours → matches=[] + fallbackReason="no_visual_neighbor"', async () => {
    const { encoder, repo, enricher, cache } = buildMocks([]);
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    const result = await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(result.matches).toEqual([]);
    expect(result.fallbackReason).toBe('no_visual_neighbor');
  });

  it('R10 — every visualScore in returned matches is in `[0, 1]`', async () => {
    const { encoder, repo, enricher, cache } = buildMocks();
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    const result = await service.compare({ ...DEFAULT_INPUT, buffer });

    for (const m of result.matches) {
      expect(m.visualScore).toBeGreaterThanOrEqual(0);
      expect(m.visualScore).toBeLessThanOrEqual(1);
    }
  });

  it('R11 — encoder throws EncoderUnavailableError → matches=[] + fallbackReason="encoder_unavailable", no DB call', async () => {
    const { encoder, repo, enricher, cache } = buildMocks();
    encoder.encode.mockRejectedValueOnce(new EncoderUnavailableError('cold start failure'));

    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    const result = await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(result.matches).toEqual([]);
    expect(result.fallbackReason).toBe('encoder_unavailable');
    expect(repo.findNearest).not.toHaveBeenCalled();
    expect(enricher.enrichBatch).not.toHaveBeenCalled();
  });

  it('cache hit — second call with identical buffer skips encoder + repo + enricher', async () => {
    const cachedResult: CompareResult = {
      matches: [],
      durationMs: 7,
      modelVersion: DEFAULT_MODEL_VERSION,
      fallbackReason: 'no_visual_neighbor',
    };
    const { encoder, repo, enricher } = buildMocks();
    const cache = makeCache({
      get: jest.fn().mockResolvedValue(cachedResult),
    });

    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    const result = await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(result.fallbackReason).toBe('no_visual_neighbor');
    expect(encoder.encode).not.toHaveBeenCalled();
    expect(repo.findNearest).not.toHaveBeenCalled();
    expect(enricher.enrichBatch).not.toHaveBeenCalled();
  });
});
