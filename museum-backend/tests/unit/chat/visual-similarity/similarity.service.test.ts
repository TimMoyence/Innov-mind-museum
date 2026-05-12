/**
 * RED — T5.3 — orchestrator service `VisualSimilarityService`.
 *
 * Locks down tasks.md T5.3 + design.md §1 (pipeline) + spec R1, R3, R4, R5,
 * R10, R11:
 *   - encode → repo.findNearest(topN) → enricher.enrichBatch → fuse → template
 *     → tronquer top-K → CompareResult,
 *   - empty-neighbour set → `matches: []` + `fallbackReason: 'no_visual_neighbor'`,
 *   - encoder throws `EncoderUnavailableError` → `matches: []` +
 *     `fallbackReason: 'encoder_unavailable'`,
 *   - museumQids filter is forwarded to the repository,
 *   - top-K bound respected (and `topN ≥ max(20, 4*topK)` per R3),
 *   - matches' `visualScore` lives in `[0, 1]` (R10 contract),
 *   - top-K result cache short-circuits encoder + repo on the second call.
 *
 * SUT does not yet exist (Phase 5). Tests are RED until the editor lands
 * `similarity.service.ts`.
 */

import { makeCache } from '../../../helpers/chat/cache.fixtures';
import { makeArtworkFacts } from '../../../helpers/chat/visual-similarity/artwork-facts.fixtures';
import { makeSiglipJpegBuffer } from '../../../helpers/chat/visual-similarity/image-fixtures';
import {
  DEFAULT_MODEL_VERSION,
  makeArtworkMetadata,
  makeEncodeOutput,
  makeNearestResult,
} from '../../../helpers/chat/visual-similarity/compare.fixtures';

// T9.1 — `getLangfuse()` returns null by default (no LANGFUSE_* env in tests),
// which short-circuits all `parent?.span(...)` / `parent?.update(...)` calls in
// the SUT. Mocking lets ONE test inject a fake trace to exercise the truthy
// branches and keep coverage above the 75% branches threshold.
jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: jest.fn(() => null),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- mock helper
const { getLangfuse: mockGetLangfuse } = require('@shared/observability/langfuse.client') as {
  getLangfuse: jest.Mock;
};

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

// ---------------------------------------------------------------------------
// SUT — Phase 5 file, must not yet exist. Loaded dynamically so the suite
// produces a "Cannot find module …" RED rather than a compile failure.
// ---------------------------------------------------------------------------

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
  /** OWASP LLM08 — internal tenant scope (`museums.id`); see SUT contract. */
  museumId?: number | null;
}

const { VisualSimilarityService } =
  require('@modules/chat/useCase/visual-similarity/similarity.service') as {
    VisualSimilarityService: new (args: VisualSimilarityServiceCtorArgs) => {
      compare: (input: CompareInput) => Promise<CompareResult>;
    };
  };

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a deterministic neighbour list (descending visualScore) of size `n`.
 * @param n
 */
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

/**
 * Build a `Map<qid, ArtworkFacts>` mirroring a neighbour list — one fact per
 * qid, all sharing the default Mona-Lisa metadata so fusion is deterministic.
 * @param neighbours
 */
function makeFactsMap(neighbours: NearestResult[]): Map<string, ArtworkFacts> {
  const out = new Map<string, ArtworkFacts>();
  for (const n of neighbours) {
    out.set(n.qid, makeArtworkFacts({ qid: n.qid, title: n.metadata.title }));
  }
  return out;
}

/**
 * Build the four mocks used by every test, with sensible defaults the
 * individual tests override per-scenario.
 * @param neighbours
 */
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
    count: jest.fn(),
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

    // Sorted by finalScore descending.
    for (let i = 1; i < result.matches.length; i += 1) {
      const prev = result.matches[i - 1];
      const curr = result.matches[i];
      expect(prev?.finalScore).toBeGreaterThanOrEqual(curr?.finalScore ?? 0);
    }

    // Each match has a templated rationale and bounded scores.
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
    expect(topN).toBeGreaterThanOrEqual(40); // max(20, 4*10) = 40
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
    // The opts object is allowed to exist (uniform shape) but MUST NOT carry
    // a museumId key when none was passed — the repo would then log the
    // "unscoped global read" warn (legacy V1 behaviour).
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

    // Tenant A hits — populates the cache under tenant A's key.
    await service.compare({ ...DEFAULT_INPUT, buffer, museumId: 1 });
    // Tenant B hits with the IDENTICAL image — must NOT hit the cache from A.
    await service.compare({ ...DEFAULT_INPUT, buffer, museumId: 2 });

    // Both runs went through the encoder + repo: no cross-tenant cache reuse.
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
    // L2 norm ≈ 1 (vector is one-hot, norm = 1 by construction).
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

  // T9.1 — Langfuse instrumentation, fail-open. Exercised so the truthy
  // span / update branches stay covered (Phase 9 added ~16 such branches across
  // happy path, cache hit, encoder unavailable, no-neighbour fallback).

  /** Stand up a fake Langfuse trace + queue it for the next compare call. */
  function armFakeLangfuse(): { fakeTrace: { span: jest.Mock; update: jest.Mock } } {
    const fakeTrace = { span: jest.fn(), update: jest.fn() };
    const fakeLangfuse = { trace: jest.fn().mockReturnValue(fakeTrace) };
    mockGetLangfuse.mockReturnValueOnce(
      fakeLangfuse as unknown as ReturnType<typeof mockGetLangfuse>,
    );
    return { fakeTrace };
  }

  it('T9.1 — cache hit emits the cache-hit parent update span', async () => {
    const { fakeTrace } = armFakeLangfuse();
    const cachedResult: CompareResult = {
      matches: [],
      durationMs: 4,
      modelVersion: DEFAULT_MODEL_VERSION,
      fallbackReason: 'no_visual_neighbor',
    };
    const { encoder, repo, enricher } = buildMocks();
    const cache = makeCache({ get: jest.fn().mockResolvedValue(cachedResult) });
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(fakeTrace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({ cacheHit: true }),
        metadata: expect.objectContaining({ stage: 'cache' }),
      }),
    );
  });

  it('T9.1 — encoder unavailable emits the encoder fallback parent update span', async () => {
    const { fakeTrace } = armFakeLangfuse();
    const { encoder, repo, enricher, cache } = buildMocks();
    encoder.encode.mockRejectedValue(new EncoderUnavailableError('encoder offline'));
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(fakeTrace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({ fallbackReason: 'encoder_unavailable' }),
        metadata: expect.objectContaining({
          stage: 'encode',
          error: 'EncoderUnavailableError',
        }),
      }),
    );
  });

  it('T9.1 — empty neighbours emits the no-neighbour parent update span', async () => {
    const { fakeTrace } = armFakeLangfuse();
    const { encoder, repo, enricher, cache } = buildMocks([]);
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(fakeTrace.span).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'chat.compare.search' }),
    );
    expect(fakeTrace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({ fallbackReason: 'no_visual_neighbor' }),
        metadata: expect.objectContaining({ stage: 'search' }),
      }),
    );
  });

  it('T9.1 — emits parent + per-stage Langfuse spans when Langfuse is enabled', async () => {
    const fakeTrace = { span: jest.fn(), update: jest.fn() };
    const fakeLangfuse = { trace: jest.fn().mockReturnValue(fakeTrace) };
    mockGetLangfuse.mockReturnValueOnce(
      fakeLangfuse as unknown as ReturnType<typeof mockGetLangfuse>,
    );

    const { encoder, repo, enricher, cache } = buildMocks();
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: { wVisual: 0.7, wMeta: 0.3 },
    });

    await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(fakeLangfuse.trace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'chat.compare.total' }),
    );
    // 4 stage spans expected on the happy path: encode, search, enrich, fusion.
    const spanNames = fakeTrace.span.mock.calls.map((call) => call[0].name);
    expect(spanNames).toEqual([
      'chat.compare.encode',
      'chat.compare.search',
      'chat.compare.enrich',
      'chat.compare.fusion',
    ]);
    // Final parent update fires with `stage: complete`.
    expect(fakeTrace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ stage: 'complete' }),
      }),
    );
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
