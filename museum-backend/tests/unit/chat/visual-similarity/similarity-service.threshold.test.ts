/**
 * RED — Cycle D / D-03 — score floor (`fallbackVisualThreshold`) in
 * `VisualSimilarityService.scoreAndPackage`.
 *
 * Locks down spec-cycleD.md §D-03 + matrix T-D03-1..5 + Décision D1
 * (filter on `finalScore`, NOT `visualScore`):
 *   - D-03.1 — matches with `finalScore < fallbackVisualThreshold` are excluded
 *     BEFORE the `slice(0, topK)` truncation.
 *   - D-03.2 — if every candidate is below the floor (while kNN DID return
 *     neighbours) → `{ matches: [], fallbackReason: 'no_visual_neighbor' }`
 *     (NOT a top-K of low-confidence noise).
 *   - D-03.3/D-03.4 — `fallbackVisualThreshold` is injected via the service deps;
 *     when absent, the service falls back to the documented default `0.4`.
 *   - D-03.5 — the floor is applied on `finalScore` (the fused score driving the
 *     sort + truncation), inclusive (`>=`, an exactly-at-threshold match stays).
 *
 * To make `finalScore` directly controllable, every test uses
 * `weights: { wVisual: 1, wMeta: 0 }`. In V1 `metadataScore === 0` (no query
 * facts), so `finalScore = 1 * visualScore + 0 * 0 = visualScore`. Driving the
 * neighbour `visualScore` therefore drives `finalScore` exactly (no IEEE-754
 * rescaling from the 0.7/0.3 prod weights), which is what lets us assert the
 * inclusive boundary at the threshold value precisely.
 *
 * These cases FAIL today: `scoreAndPackage` (similarity.service.ts:436-464)
 * sorts by `finalScore` then `slice(0, topK)` with NO score floor;
 * `fallbackVisualThreshold` (env.ts:345, default 0.4) is declared but consumed
 * nowhere (`grep -rn fallbackVisualThreshold src` → env decl + type only). A
 * non-relevant photo still returns a top-K of low-confidence matches.
 *
 * NOTE — `similarity.service.test.ts` (sibling) is FROZEN; this file is a new,
 * additive suite scoped to the score-floor contract so the existing suite stays
 * byte-for-byte intact.
 */

import { makeCache } from '../../../helpers/chat/cache.fixtures';
import { makeArtworkFacts } from '../../../helpers/chat/visual-similarity/artwork-facts.fixtures';
import { makeSiglipJpegBuffer } from '../../../helpers/chat/visual-similarity/image-fixtures';
import {
  makeArtworkMetadata,
  makeEncodeOutput,
  makeNearestResult,
} from '../../../helpers/chat/visual-similarity/compare.fixtures';

// Langfuse null by default (no LANGFUSE_* env in tests) — short-circuits the
// `parent?.span(...)` / `parent?.update(...)` calls, same pattern as the
// frozen sibling suite.
jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: jest.fn(() => null),
}));

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
// SUT — ctor accepts `fallbackVisualThreshold` (D-03.3 target contract). Loaded
// dynamically so a missing/renamed export surfaces as a runtime RED rather than
// a compile-time failure.
// ---------------------------------------------------------------------------

interface VisualSimilarityServiceCtorArgs {
  encoder: EmbeddingsPort;
  repo: ArtworkEmbeddingRepository;
  enricher: { enrichBatch: (qids: string[], lang: string) => Promise<Map<string, ArtworkFacts>> };
  cache: CacheService;
  weights: { wVisual: number; wMeta: number };
  topN?: number;
  topK?: number;
  /** D-03.3 — score floor injected from `env.visualSimilarity.fallbackVisualThreshold`. */
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

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** wVisual=1, wMeta=0 → finalScore === visualScore (V1 metadataScore=0). */
const SCORE_AS_VISUAL = { wVisual: 1, wMeta: 0 } as const;

/**
 * Build neighbours whose `visualScore` (== finalScore under SCORE_AS_VISUAL)
 * is taken verbatim from `scores`, in order. Each gets a distinct qid so the
 * enricher resolves a fact for every one.
 * @param scores - desired finalScore per neighbour.
 */
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

/** One fact per neighbour qid (so none get dropped as unenrichable). */
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

const THRESHOLD = 0.4;

describe('VisualSimilarityService.compare — D-03 score floor (fallbackVisualThreshold)', () => {
  let buffer: Buffer;

  beforeAll(async () => {
    buffer = await makeSiglipJpegBuffer();
  });

  it('T-D03-3 — every neighbour above the floor → all returned (sorted, capped at topK)', async () => {
    // 5 neighbours, all finalScore > 0.4 — none should be filtered.
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
    // 2 above (0.9, 0.6), 3 below (0.39, 0.2, 0.05) → expect exactly the 2 above.
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
    // The sub-floor scores (0.39, 0.2, 0.05) must NOT appear.
    const returnedScores = result.matches.map((m) => m.finalScore);
    expect(returnedScores).not.toContain(0.39);
    expect(returnedScores).not.toContain(0.2);
    expect(returnedScores).not.toContain(0.05);
  });

  it('T-D03-1 — all neighbours below the floor → matches=[] + fallbackReason="no_visual_neighbor"', async () => {
    // 5 neighbours, ALL finalScore < 0.4 — kNN returned candidates but none is a
    // real similarity → must collapse to the no_visual_neighbor fallback, NOT a
    // top-K of noise.
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
    // The repo DID return neighbours (this is the sub-floor path, not the
    // empty-kNN path) — proves the new filter, not the existing :274 guard.
    expect(repo.findNearest).toHaveBeenCalledTimes(1);
  });

  it('T-D03-4 — score exactly == floor is INCLUSIVE (>=, not >)', async () => {
    // One match exactly at 0.4, one below (0.39). Only the at-threshold one stays.
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
    // Same neighbours, stricter floor. 0.9 and 0.7 pass; 0.5, 0.45, 0.3 fail.
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
    // No fallbackVisualThreshold in deps. Mix straddling 0.4 — only >=0.4 stay
    // if the documented default (env.ts:345) is honoured.
    const neighbours = makeNeighboursWithScores([0.8, 0.5, 0.39, 0.1]);
    const { encoder, repo, enricher, cache } = buildMocks(neighbours);
    const service = new VisualSimilarityService({
      encoder,
      repo,
      enricher,
      cache,
      weights: SCORE_AS_VISUAL,
      // fallbackVisualThreshold intentionally omitted.
    });

    const result = await service.compare({ ...DEFAULT_INPUT, buffer });

    expect(result.matches).toHaveLength(2);
    for (const m of result.matches) {
      expect(m.finalScore).toBeGreaterThanOrEqual(0.4);
    }
  });
});
