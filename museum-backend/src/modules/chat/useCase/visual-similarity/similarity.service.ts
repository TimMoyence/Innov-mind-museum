import { createHash } from 'node:crypto';

import { EncoderUnavailableError } from '@modules/chat/domain/ports/embeddings.port';
import { errorMessage } from '@shared/errors/error-message';
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
const MIN_TOP_N = 20;
const TOP_N_TOPK_MULTIPLIER = 4;
const DEFAULT_FALLBACK_VISUAL_THRESHOLD = 0.4;
const RESULT_CACHE_TTL_SECONDS = 60 * 60;
const RESULT_CACHE_KEY_PREFIX = 'visual-similarity:compare:v1';

export interface EnricherLike {
  enrichBatch(qids: string[], lang: string): Promise<Map<string, ArtworkFacts>>;
}

export interface VisualSimilarityServiceDeps {
  encoder: EmbeddingsPort;
  repo: ArtworkEmbeddingRepository;
  enricher: EnricherLike;
  cache: CacheService;
  reranker: RerankerPort;
  weights: { wVisual: number; wMeta: number };
  topN?: number;
  topK?: number;
  rerankTimeoutMs?: number;
  fallbackVisualThreshold?: number;
}

export interface CompareInput {
  buffer: Buffer;
  mimeType: EmbeddingImageMimeType;
  topK: number;
  locale: 'fr' | 'en';
  museumQids?: string[];
  museumId?: number | null;
  queryText?: string;
}

function resolveTopN(topK: number, override: number | undefined): number {
  if (override !== undefined) {
    return Math.max(override, MIN_TOP_N);
  }
  return Math.max(MIN_TOP_N, TOP_N_TOPK_MULTIPLIER * topK);
}

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

  if (neighbour.metadata.thumbnailUrl !== undefined) {
    match.thumbnailUrl = neighbour.metadata.thumbnailUrl;
  }
  if (neighbour.metadata.attribution !== undefined) {
    match.attribution = neighbour.metadata.attribution;
  }

  return match;
}

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
        error: errorMessage(err),
      });
    }
    return undefined;
  }

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
    const aboveFloor = matches.filter((m) => m.finalScore >= this.fallbackVisualThreshold);
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

  private async writeCache(key: string, value: CompareResult): Promise<void> {
    try {
      await this.cache.set(key, value, RESULT_CACHE_TTL_SECONDS);
    } catch (err) {
      logger.warn('visual_similarity_cache_set_error', {
        error: errorMessage(err),
      });
    }
  }
}
