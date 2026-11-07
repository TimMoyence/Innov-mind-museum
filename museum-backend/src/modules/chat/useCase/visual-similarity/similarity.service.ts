/**
 * VisualSimilarityService — orchestrates `/chat/compare`. Pure orchestration
 * over encoder + pgvector kNN + Wikidata enricher + scoring/fusion + templater.
 *
 * Pipeline contract (spec R1/R3/R4/R5/R10/R11, design.md §1):
 * - Cache lookup first (TTL 1h, key includes sha256(buffer)+locale+topK+sorted(museumQids)+museumId).
 * - Encode → on `EncoderUnavailableError`: `fallbackReason: 'encoder_unavailable'` (R11).
 * - findNearest with `topN = max(20, 4*topK)` (R3); empty → `'no_visual_neighbor'` (R10).
 * - V1: NO query facts → metadataScore=0, finalScore=wVisual*visualScore. V2 wires query through.
 * - Sort desc, truncate, template (no LLM, D5). Cache write fail-soft.
 */
import { createHash } from 'node:crypto';

import { EncoderUnavailableError } from '@modules/chat/domain/ports/embeddings.port';
import { logger } from '@shared/logger/logger';

import { templateRationale, type SharedAttribute } from './rationale-templater';
import { maybeRerankCompareMatches } from './rerank-phase';
import { computeMetadataScore, fuse } from './similarity-scoring';

import type {
  EmbeddingImageMimeType,
  EmbeddingsPort,
} from '@modules/chat/domain/ports/embeddings.port';
import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';
import type { RerankerPort } from '@modules/chat/domain/ports/reranker.port';
import type {
  ArtworkEmbeddingRepository,
  FindNearestOptions,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';
import type {
  CompareMatch,
  CompareResult,
  NearestResult,
} from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { CacheService } from '@shared/cache/cache.port';

const DEFAULT_TOP_K = 5;
/** R3 — kNN candidate pool floor. */
const MIN_TOP_N = 20;
const TOP_N_TOPK_MULTIPLIER = 4;
/** D-03.4 — score-floor default, aligned with `env.ts:345` (legacy callers). */
const DEFAULT_FALLBACK_VISUAL_THRESHOLD = 0.4;
const RESULT_CACHE_TTL_SECONDS = 60 * 60;
/** Bump version segment on payload-shape changes. */
const RESULT_CACHE_KEY_PREFIX = 'visual-similarity:compare:v1';

export interface EnricherLike {
  /**
   * Missing entities MUST be absent from the map (no null placeholders) —
   * orchestrator uses `.has(qid)` to drop unenrichable candidates.
   */
  enrichBatch(qids: string[], lang: string): Promise<Map<string, ArtworkFacts>>;
}

export interface VisualSimilarityServiceDeps {
  encoder: EmbeddingsPort;
  repo: ArtworkEmbeddingRepository;
  enricher: EnricherLike;
  cache: CacheService;
  /**
   * C9.13 — cross-encoder reranker, invoked only when `CompareInput.queryText`
   * is set (V1 callers don't pass it; V2 chat-pipeline integration will).
   * Fail-open: any throw / timeout preserves the fused-score ordering.
   */
  reranker: RerankerPort;
  /** Typically `{ wVisual: 0.7, wMeta: 0.3 }`. */
  weights: { wVisual: number; wMeta: number };
  /** Override default kNN candidate pool size (`max(20, 4*topK)`). */
  topN?: number;
  topK?: number;
  /** C9.13 — hard deadline on `reranker.rerank()` before fail-open. Default 2000ms. */
  rerankTimeoutMs?: number;
  /**
   * D-03 — score floor on `finalScore` (Décision D1). Candidates below it are
   * excluded before truncation. OPTIONAL — omitted (legacy callers) defaults to
   * {@link DEFAULT_FALLBACK_VISUAL_THRESHOLD} (0.4, env.ts:345).
   */
  fallbackVisualThreshold?: number;
}

export interface CompareInput {
  /** Raw bytes — already EXIF-stripped + magic-byte validated upstream. */
  buffer: Buffer;
  mimeType: EmbeddingImageMimeType;
  topK: number;
  locale: 'fr' | 'en';
  /** External public-axis filter forwarded to kNN. */
  museumQids?: string[];
  /**
   * Internal tenant scope (`museums.id`). OWASP LLM08 — global rows
   * (museum_id IS NULL) always visible; tenant-private rows of OTHER museums
   * never returned. V1 single-tenant ships unscoped (repo logs warn).
   */
  museumId?: number | null;
  /**
   * C9.13 — optional textual query used to drive the cross-encoder reranker
   * over `topMatches.facts.title`. V1 callers (current `/chat/compare` route)
   * do not pass this; V2 chat-pipeline integration will. When undefined, the
   * reranker is NOT called and the fused-score ordering is preserved exactly.
   */
  queryText?: string;
}

/** R3 — `max(20, 4*topK)`. */
function resolveTopN(topK: number, override: number | undefined): number {
  if (override !== undefined) {
    return Math.max(override, MIN_TOP_N);
  }
  return Math.max(MIN_TOP_N, TOP_N_TOPK_MULTIPLIER * topK);
}

/**
 * SEC — `museumId` MUST be in the key (OWASP LLM08). Without it, tenant A's
 * cached result could be served to tenant B for the same image+locale+topK,
 * defeating the repo-layer tenant scope.
 */
function resultCacheKey(input: CompareInput): string {
  const hash = createHash('sha256').update(input.buffer).digest('hex');
  const museumPart = (input.museumQids ?? [])
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .join(',');
  const tenantPart = input.museumId != null ? String(input.museumId) : '';
  const topKPart = String(input.topK);
  return `${RESULT_CACHE_KEY_PREFIX}:${input.locale}:${topKPart}:${museumPart}:t${tenantPart}:${hash}`;
}

function catalogFacts({ qid, metadata }: NearestResult): ArtworkFacts {
  const facts: ArtworkFacts = { qid, title: metadata.title, imageUrl: metadata.imageUrl };
  if (metadata.artist !== undefined) facts.artist = metadata.artist;
  return facts;
}

/**
 * V1: query facts undefined → metadataScore=0 → finalScore = wVisual*visualScore.
 * sharedAttributes hardcoded `[]` (no query → no overlap); V2 will recompute
 * from query facts without changing call sites.
 */
function scoreCandidate(
  neighbour: NearestResult,
  facts: ArtworkFacts,
  weights: { wVisual: number; wMeta: number },
  locale: 'fr' | 'en',
): CompareMatch {
  const queryFacts: ArtworkFacts | undefined = undefined;
  const metadataScore = computeMetadataScore(queryFacts, facts);
  const finalScore = fuse(neighbour.visualScore, metadataScore, weights);

  const sharedAttributes: SharedAttribute[] = [];
  const rationale = templateRationale(facts, locale, sharedAttributes);

  const match: CompareMatch = {
    qid: neighbour.qid,
    title: facts.title,
    imageUrl: neighbour.metadata.imageUrl,
    visualScore: neighbour.visualScore,
    metadataScore,
    finalScore,
    rationale,
    facts,
  };

  // exactOptionalPropertyTypes: don't set keys to `undefined`.
  if (neighbour.metadata.thumbnailUrl !== undefined) {
    match.thumbnailUrl = neighbour.metadata.thumbnailUrl;
  }
  if (neighbour.metadata.attribution !== undefined) {
    match.attribution = neighbour.metadata.attribution;
  }

  return match;
}

/** Single instance per process — no per-request state. */
export class VisualSimilarityService {
  private readonly encoder: EmbeddingsPort;
  private readonly repo: ArtworkEmbeddingRepository;
  private readonly enricher: EnricherLike;
  private readonly cache: CacheService;
  private readonly reranker: RerankerPort;
  private readonly weights: { wVisual: number; wMeta: number };
  private readonly topNOverride: number | undefined;
  private readonly defaultTopK: number;
  private readonly rerankTimeoutMs: number;
  private readonly fallbackVisualThreshold: number;

  public constructor(deps: VisualSimilarityServiceDeps) {
    this.encoder = deps.encoder;
    this.repo = deps.repo;
    this.enricher = deps.enricher;
    this.cache = deps.cache;
    this.reranker = deps.reranker;
    this.weights = deps.weights;
    this.topNOverride = deps.topN;
    this.defaultTopK = deps.topK ?? DEFAULT_TOP_K;
    this.rerankTimeoutMs = deps.rerankTimeoutMs ?? 2000;
    this.fallbackVisualThreshold =
      deps.fallbackVisualThreshold ?? DEFAULT_FALLBACK_VISUAL_THRESHOLD;
  }

  /** See file header for full pipeline contract (spec R1/R3/R4/R5/R10/R11). */
  public async compare(input: CompareInput): Promise<CompareResult> {
    const startedAt = Date.now();
    const topK = input.topK > 0 ? input.topK : this.defaultTopK;
    const cacheKey = resultCacheKey({ ...input, topK });

    const cacheHit = await this.tryCache(cacheKey);
    if (cacheHit !== undefined) return cacheHit;

    const encoded = await this.encodeOrFallback(input, startedAt);
    if ('fallback' in encoded) return encoded.fallback;
    const { vector, modelVersion } = encoded;
    const topN = resolveTopN(topK, this.topNOverride);
    // exactOptionalPropertyTypes: only set fields when defined so repo can
    // distinguish "not provided" (legacy global read + warn, OWASP LLM08)
    // from explicit scope.
    const findOpts: FindNearestOptions = {};
    if (input.museumQids !== undefined) {
      findOpts.museumQids = input.museumQids;
    }
    if (input.museumId !== undefined && input.museumId !== null) {
      findOpts.museumId = input.museumId;
    }
    const neighbours = await this.repo.findNearest(vector, topN, findOpts);

    if (neighbours.length === 0) {
      const result = this.buildNoNeighborResult(modelVersion, startedAt);
      await this.writeCache(cacheKey, result);
      return result;
    }
    const qids = neighbours.map((n) => n.qid);
    // Enrichment is a supplementary overlay over the visual kNN. Its per-qid
    // failures are isolated INSIDE wikidata-enricher (a lookup throw → gap in
    // the Map, never a batch rejection) — that is the root-cause guard for the
    // 2026-06-14 prod 500 (encoder fix exposed an unprotected lookup throw).
    const factsByQid = await this.enricher.enrichBatch(qids, input.locale);

    const result = this.scoreAndPackage({
      neighbours,
      factsByQid,
      locale: input.locale,
      topK,
      modelVersion,
      startedAt,
    });

    result.matches = await this.applyOptionalRerank(input.queryText, result.matches);

    if (result.matches.every(({ qid }) => factsByQid.has(qid))) {
      await this.writeCache(cacheKey, result);
    }
    return result;
  }

  /**
   * C9.13 — invoke optional rerank phase. Skipped when `queryText` is undefined
   * (V1 default — current `/chat/compare` callers never pass it) or when
   * there's nothing to reorder (≤ 1 match). Fail-open: any throw / timeout
   * inside `maybeRerankCompareMatches` returns the input untouched.
   */
  private async applyOptionalRerank(
    queryText: string | undefined,
    matches: CompareMatch[],
  ): Promise<CompareMatch[]> {
    if (queryText === undefined || matches.length <= 1) return matches;
    return await maybeRerankCompareMatches(
      { reranker: this.reranker, rerankTimeoutMs: this.rerankTimeoutMs },
      queryText,
      matches,
    );
  }

  private async tryCache(cacheKey: string): Promise<CompareResult | undefined> {
    try {
      const cached = await this.cache.get<CompareResult>(cacheKey);
      if (cached !== null) {
        return cached;
      }
    } catch (err) {
      logger.warn('visual_similarity_cache_get_error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return undefined;
  }

  /** On `EncoderUnavailableError`: returns `{ fallback }` discriminator. */
  private async encodeOrFallback(
    input: CompareInput,
    startedAt: number,
  ): Promise<{ vector: Float32Array; modelVersion: string } | { fallback: CompareResult }> {
    try {
      const encoded = await this.encoder.encode({
        buffer: input.buffer,
        mimeType: input.mimeType,
      });
      return { vector: encoded.vector, modelVersion: encoded.modelVersion };
    } catch (err) {
      if (!(err instanceof EncoderUnavailableError)) throw err;
      logger.warn('visual_similarity_encoder_unavailable', { error: err.message });
      return {
        fallback: {
          matches: [],
          durationMs: Date.now() - startedAt,
          modelVersion: '',
          fallbackReason: 'encoder_unavailable',
        },
      };
    }
  }

  /**
   * R-T4 — shared `no_visual_neighbor` builder for both the empty-kNN and
   * all-below-floor paths (trace + `compareFallbackTotal` stay in sync). Side
   * effects fail-open via `safeTrace`.
   */
  private buildNoNeighborResult(modelVersion: string, startedAt: number): CompareResult {
    return {
      matches: [],
      durationMs: Date.now() - startedAt,
      modelVersion,
      fallbackReason: 'no_visual_neighbor',
    };
  }

  private scoreAndPackage(args: {
    neighbours: NearestResult[];
    factsByQid: Map<string, ArtworkFacts>;
    locale: 'fr' | 'en';
    topK: number;
    modelVersion: string;
    startedAt: number;
  }): CompareResult {
    const { neighbours, factsByQid, locale, topK, modelVersion, startedAt } = args;
    const matches: CompareMatch[] = [];
    for (const neighbour of neighbours) {
      const facts = factsByQid.get(neighbour.qid) ?? catalogFacts(neighbour);
      matches.push(scoreCandidate(neighbour, facts, this.weights, locale));
    }
    matches.sort((a, b) => b.finalScore - a.finalScore);
    // D-03.1/D-03.5 — drop sub-floor candidates (Décision D1: `finalScore`,
    // inclusive `>=`) BEFORE truncation; no top-K of low-confidence noise.
    const aboveFloor = matches.filter((m) => m.finalScore >= this.fallbackVisualThreshold);
    // D-03.2 — neighbours existed but none clears the floor → shared fallback.
    if (aboveFloor.length === 0) {
      return this.buildNoNeighborResult(modelVersion, startedAt);
    }
    const topMatches = aboveFloor.slice(0, topK);
    return {
      matches: topMatches,
      durationMs: Date.now() - startedAt,
      modelVersion,
    };
  }

  /** Fail-soft: Redis outage cannot break response contract. */
  private async writeCache(key: string, value: CompareResult): Promise<void> {
    try {
      await this.cache.set(key, value, RESULT_CACHE_TTL_SECONDS);
    } catch (err) {
      logger.warn('visual_similarity_cache_set_error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
