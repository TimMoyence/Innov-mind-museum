/**
 * T5.3 — `VisualSimilarityService` orchestrator for the `/chat/compare`
 * pipeline.
 *
 * Wires together the four collaborators introduced in Phase 4 + Phase 5:
 *
 *   1. {@link EmbeddingsPort.encode}  — image buffer → L2-normalised vector.
 *   2. {@link ArtworkEmbeddingRepository.findNearest} — pgvector kNN top-N.
 *   3. {@link WikidataEnricher.enrichBatch} — hydrate verified facts per QID.
 *   4. {@link computeMetadataScore} + {@link fuse} — score + linear fusion.
 *   5. {@link templateRationale} — deterministic FR / EN rationale phrase.
 *
 * Pipeline contract (locked by `tests/unit/chat/visual-similarity/similarity.service.test.ts`,
 * mirrors design.md §1 + spec R1, R3, R4, R5, R10, R11):
 *
 *   - **Cache lookup first** (D9 RETAINED top-K cache) — keyed by
 *     `sha256(buffer) + locale + topK + sorted(museumQids)` so an identical
 *     re-submission short-circuits encode + repo + enrich. TTL = 1h.
 *   - **Encode** — `EmbeddingsPort.encode(input)`. On `EncoderUnavailableError`,
 *     return `matches: []` + `fallbackReason: 'encoder_unavailable'` WITHOUT
 *     touching the repo or enricher (R11).
 *   - **Find nearest** — `topN = max(20, 4 * topK)` (R3). Forwards `museumQids`
 *     filter (R4).
 *   - **Empty neighbours** — return `matches: []` + `fallbackReason:
 *     'no_visual_neighbor'` (R10).
 *   - **Enrich** — `enrichBatch(qids, locale)`. Candidates with no resolved
 *     facts are dropped (UFR-013: never fabricate a Wikidata payload).
 *   - **Score + fuse** — V1 has NO query facts (the user image is not
 *     reverse-resolved), so `metadataScore` always evaluates to 0 per
 *     {@link computeMetadataScore} contract; `finalScore` collapses to
 *     `wVisual * visualScore`. Wired explicitly so V2 can pass query facts
 *     through without changing the call site.
 *   - **Sort + truncate** — descending `finalScore`, take top-K.
 *   - **Template rationale** — per-locale templated phrase (no LLM, design D5).
 *   - **Cache write** — best-effort, fail-soft (errors logged, swallowed).
 *
 * Pure orchestration — no domain logic lives here. Everything below the
 * `compare` method delegates to the dedicated collaborators.
 */
import { createHash } from 'node:crypto';

import { EncoderUnavailableError } from '@modules/chat/domain/ports/embeddings.port';
import { logger } from '@shared/logger/logger';

import { templateRationale, type SharedAttribute } from './rationale-templater';
import { computeMetadataScore, fuse } from './similarity-scoring';

import type {
  EmbeddingImageMimeType,
  EmbeddingsPort,
} from '@modules/chat/domain/ports/embeddings.port';
import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';
import type { ArtworkEmbeddingRepository } from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';
import type {
  CompareMatch,
  CompareResult,
  NearestResult,
} from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { CacheService } from '@shared/cache/cache.port';

/** Default top-K applied when the caller doesn't specify one (mirrors design §5). */
const DEFAULT_TOP_K = 5;
/** Hard floor for the kNN candidate pool — design.md §1 + spec R3. */
const MIN_TOP_N = 20;
/** Multiplier of `topK` used to compute the kNN candidate pool when `4*topK > 20`. */
const TOP_N_TOPK_MULTIPLIER = 4;
/** Top-K result cache TTL — design D9. */
const RESULT_CACHE_TTL_SECONDS = 60 * 60;
/** Cache key namespace. Bump the version segment on payload-shape changes. */
const RESULT_CACHE_KEY_PREFIX = 'visual-similarity:compare:v1';

/**
 * Minimal structural shape required from the Wikidata enricher.
 *
 * The production `WikidataEnricher` class (T4.6) implements a wider surface
 * (concurrency cap, cache-aside, …) but the orchestrator only needs the
 * batch lookup. Typing the dep structurally keeps the service trivially
 * mockable in unit tests while still letting the composition root inject
 * the production implementation 1:1.
 */
export interface EnricherLike {
  /**
   * Resolve Wikidata QIDs to verified facts. Missing entities MUST be absent
   * from the returned map (no `null` placeholders) — the orchestrator uses
   * `.has(qid)` to drop unenrichable candidates.
   */
  enrichBatch(qids: string[], lang: string): Promise<Map<string, ArtworkFacts>>;
}

/** Constructor dependencies for {@link VisualSimilarityService}. */
export interface VisualSimilarityServiceDeps {
  /** Visual encoder port — image buffer → L2-normalised vector. */
  encoder: EmbeddingsPort;
  /** pgvector kNN repository. */
  repo: ArtworkEmbeddingRepository;
  /** Batch Wikidata enricher (or any structural match — see {@link EnricherLike}). */
  enricher: EnricherLike;
  /** Top-K result cache backend (Redis in prod, in-memory in tests). */
  cache: CacheService;
  /** Linear fusion weights (typically `{ wVisual: 0.7, wMeta: 0.3 }`). */
  weights: { wVisual: number; wMeta: number };
  /** Override the default kNN candidate pool size (`max(20, 4 * topK)`). */
  topN?: number;
  /** Override the default top-K (5). */
  topK?: number;
}

/** One call to {@link VisualSimilarityService.compare}. */
export interface CompareInput {
  /** Raw image bytes — already EXIF-stripped + magic-byte validated upstream. */
  buffer: Buffer;
  /** Validated MIME type. */
  mimeType: EmbeddingImageMimeType;
  /** Number of matches the caller wants back, post-sort + post-truncate. */
  topK: number;
  /** Resolved language for rationale + Wikidata enrichment. */
  locale: 'fr' | 'en';
  /** Optional museum-scope filter forwarded to the kNN search. */
  museumQids?: string[];
}

/**
 * Compute the topN candidate-pool size from a topK, honouring the spec floor
 * `max(20, 4 * topK)` (R3).
 */
function resolveTopN(topK: number, override: number | undefined): number {
  if (override !== undefined) {
    return Math.max(override, MIN_TOP_N);
  }
  return Math.max(MIN_TOP_N, TOP_N_TOPK_MULTIPLIER * topK);
}

/**
 * Build the deterministic top-K result cache key for an input.
 *
 * Includes `sha256(buffer)` so a re-submission of an identical image
 * short-circuits the whole pipeline. `locale` + `topK` + sorted `museumQids`
 * are folded in so different request shapes don't collide.
 */
function resultCacheKey(input: CompareInput): string {
  const hash = createHash('sha256').update(input.buffer).digest('hex');
  const museumPart = (input.museumQids ?? [])
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .join(',');
  const topKPart = String(input.topK);
  return `${RESULT_CACHE_KEY_PREFIX}:${input.locale}:${topKPart}:${museumPart}:${hash}`;
}

/**
 * In V1 the user's image is NOT reverse-enriched — `query` is undefined and
 * {@link computeMetadataScore} returns 0 so `finalScore` collapses to the
 * weighted visual term. The `sharedAttributes` list is empty by the same
 * reasoning (no query facts → no overlap to detect), and
 * {@link templateRationale} renders the FR / EN fallback literal.
 *
 * Hardcoding `[]` here (rather than threading it through every collaborator)
 * keeps the call sites honest: when V2 lands query enrichment, only the
 * `query` argument changes and the `sharedAttributes` array is recomputed
 * from the same query facts.
 *
 * Returned in a stable shape so tests can assert structural invariants
 * regardless of metadata signal availability.
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

  // V1: no query facts → no shared attributes → templater returns the
  // locale-specific fallback ("Œuvre similaire" / "Similar artwork").
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

  // Spread optional fields without setting them to `undefined` (keeps the
  // serialised JSON tidy and the type `exactOptionalPropertyTypes`-friendly).
  if (neighbour.metadata.thumbnailUrl !== undefined) {
    match.thumbnailUrl = neighbour.metadata.thumbnailUrl;
  }
  if (neighbour.metadata.attribution !== undefined) {
    match.attribution = neighbour.metadata.attribution;
  }

  return match;
}

/**
 * Orchestrator for the `/chat/compare` pipeline.
 *
 * Construct one instance per process at the composition root — the class
 * holds no per-request state, only references to its collaborators.
 */
export class VisualSimilarityService {
  private readonly encoder: EmbeddingsPort;
  private readonly repo: ArtworkEmbeddingRepository;
  private readonly enricher: EnricherLike;
  private readonly cache: CacheService;
  private readonly weights: { wVisual: number; wMeta: number };
  private readonly topNOverride: number | undefined;
  private readonly defaultTopK: number;

  /**
   * Wire the orchestrator to its collaborators.
   *
   * @param deps - See {@link VisualSimilarityServiceDeps}.
   */
  public constructor(deps: VisualSimilarityServiceDeps) {
    this.encoder = deps.encoder;
    this.repo = deps.repo;
    this.enricher = deps.enricher;
    this.cache = deps.cache;
    this.weights = deps.weights;
    this.topNOverride = deps.topN;
    this.defaultTopK = deps.topK ?? DEFAULT_TOP_K;
  }

  /**
   * Run the full visual-similarity pipeline for a single input image.
   *
   * Behaviour per spec R1, R3, R4, R5, R10, R11 + design.md §1 — see file
   * header for the full contract.
   *
   * @param input - Input payload (buffer + mime + topK + locale + optional museum filter).
   * @returns The top-K matches, durationMs, modelVersion, and an optional
   *          fallbackReason when the pipeline could not produce results.
   */
  public async compare(input: CompareInput): Promise<CompareResult> {
    const startedAt = Date.now();
    const topK = input.topK > 0 ? input.topK : this.defaultTopK;
    const cacheKey = resultCacheKey({ ...input, topK });

    // 1) Cache short-circuit — fail-soft on cache errors, fall through to the
    //    full pipeline. We never let a cache outage break the API contract.
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

    // 2) Encode — translate the EncoderUnavailableError into the contract
    //    fallback so the HTTP adapter can map cleanly to a 503.
    let vector: Float32Array;
    let modelVersion: string;
    try {
      const encoded = await this.encoder.encode({
        buffer: input.buffer,
        mimeType: input.mimeType,
      });
      vector = encoded.vector;
      modelVersion = encoded.modelVersion;
    } catch (err) {
      if (err instanceof EncoderUnavailableError) {
        logger.warn('visual_similarity_encoder_unavailable', {
          error: err.message,
        });
        return {
          matches: [],
          durationMs: Date.now() - startedAt,
          modelVersion: '',
          fallbackReason: 'encoder_unavailable',
        };
      }
      throw err;
    }

    // 3) kNN search.
    const topN = resolveTopN(topK, this.topNOverride);
    const findOpts =
      input.museumQids !== undefined ? { museumQids: input.museumQids } : undefined;
    const neighbours = await this.repo.findNearest(vector, topN, findOpts);

    // 4) Empty neighbour set → contractual fallback.
    if (neighbours.length === 0) {
      const result: CompareResult = {
        matches: [],
        durationMs: Date.now() - startedAt,
        modelVersion,
        fallbackReason: 'no_visual_neighbor',
      };
      await this.writeCache(cacheKey, result);
      return result;
    }

    // 5) Enrich the candidate list with verified Wikidata facts. Candidates
    //    that do not resolve are dropped (UFR-013: never fabricate facts).
    const qids = neighbours.map((n) => n.qid);
    const factsByQid = await this.enricher.enrichBatch(qids, input.locale);

    // 6) Score + fuse + template — collect into intermediate `CompareMatch[]`.
    const matches: CompareMatch[] = [];
    for (const neighbour of neighbours) {
      const facts = factsByQid.get(neighbour.qid);
      if (facts === undefined) {
        continue;
      }
      matches.push(scoreCandidate(neighbour, facts, this.weights, input.locale));
    }

    // 7) Sort by finalScore desc, then truncate to top-K.
    matches.sort((a, b) => b.finalScore - a.finalScore);
    const topMatches = matches.slice(0, topK);

    const result: CompareResult = {
      matches: topMatches,
      durationMs: Date.now() - startedAt,
      modelVersion,
    };

    // 8) Cache write — fail-soft.
    await this.writeCache(cacheKey, result);

    return result;
  }

  /**
   * Best-effort top-K result cache write. Errors are logged and swallowed
   * so a Redis outage cannot break the response contract.
   */
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
