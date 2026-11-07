import { logger } from '@shared/logger/logger';

import { scoreImage } from './image-scoring';

import type { ImageCandidate } from './image-scoring';
import type { EnrichedImage, EnrichedImageSource } from '@modules/chat/domain/chat.types';
import type {
  ImageSourceClient,
  ImageSourcePhoto,
} from '@modules/chat/domain/ports/image-source.port';

export interface ImageEnrichmentConfig {
  cacheTtlMs: number;
  cacheMaxEntries: number;
  fetchTimeoutMs: number;
  maxImagesPerResponse: number;
}

interface CacheEntry {
  images: EnrichedImage[];
  expiresAt: number;
}

/**
 * Per-search-term annotation propagated from the LLM through the aggregator.
 *
 * v2 (C2 finition 2026-05) — when the LLM produces a `suggestedImages` entry,
 * the matching `query` plus its `caption` + `rationale` flow here so the FE
 * can render LLM-authored copy under each carousel thumb. Legacy single-term
 * fallback (`enrich(searchTerm)`) emits an annotation with empty caption +
 * rationale, FE falls back to the i18n string.
 */
export interface SuggestedImageAnnotation {
  query: string;
  caption: string;
  rationale: string;
}

/** Source-priority ranks for tie-break dedup. Higher wins. */
const SOURCE_PRIORITY: Record<EnrichedImageSource, number> = {
  musaium: 4,
  wikidata: 3,
  commons: 2,
  unsplash: 1,
};

/**
 * Multi-source image enrichment service with in-memory cache, per-source
 * timeout, fail-open behaviour, and Langfuse spans.
 *
 * v1 (pre-C2): Wikidata P18 + Unsplash. Single search term per request.
 * v2 (C2 2026-05): adds Wikimedia Commons + Musaium curated catalogue clients
 * and accepts an array of search terms (parallel fan-out). Tie-break on
 * duplicate URLs follows source-priority `musaium > wikidata > commons > unsplash`.
 *
 * Any source error / timeout / malformed payload returns `[]` for that
 * source — the chat hot path is never short-circuited.
 */
export class ImageEnrichmentService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly unsplashClient: ImageSourceClient | undefined,
    private readonly config: ImageEnrichmentConfig,
    private readonly commonsClient?: ImageSourceClient | undefined,
    private readonly musaiumClient?: ImageSourceClient | undefined,
  ) {}

  /**
   * v2 overload accepts `searchTerms: string[]` (one fan-out per entry). The
   * legacy single-term path forwards to this overload via `[searchTerm]` to
   * keep the public surface stable. `museumMode` (R13) hoists any Musaium hit
   * to position 0.
   */
  async enrich(
    searchTermOrTerms: string | string[],
    wikidataImageUrl?: string,
    annotations?: readonly SuggestedImageAnnotation[],
    museumMode?: boolean,
  ): Promise<EnrichedImage[]> {
    const terms = Array.isArray(searchTermOrTerms) ? searchTermOrTerms : [searchTermOrTerms];
    const cleaned = terms.map((t) => t.trim()).filter(Boolean);
    if (cleaned.length === 0) return [];

    try {
      const cacheKey = cleaned
        .map((t) => t.toLowerCase())
        .sort((a, b) => a.localeCompare(b))
        .join('||');
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const annotationByTerm = buildAnnotationLookup(annotations);
      const candidates: EnrichedImage[] = [];

      if (wikidataImageUrl && cleaned[0]) {
        const ann = annotationByTerm.get(cleaned[0].toLowerCase());
        candidates.push(this.buildWikidataCandidate(wikidataImageUrl, cleaned[0], ann));
      }

      // Parallel fan-out: per-term × per-source. Each (term, source) pair is
      // an independent Promise; sources fail-open per pair so a Commons error
      // doesn't block Unsplash on the same term.
      const tasks: Promise<EnrichedImage[] | null>[] = [];
      for (const term of cleaned) {
        const ann = annotationByTerm.get(term.toLowerCase());
        if (this.musaiumClient) {
          tasks.push(this.fetchSourcePhotos(this.musaiumClient, 'musaium', term, ann));
        }
        if (this.commonsClient) {
          tasks.push(this.fetchSourcePhotos(this.commonsClient, 'commons', term, ann));
        }
        if (this.unsplashClient) {
          tasks.push(this.fetchSourcePhotos(this.unsplashClient, 'unsplash', term, ann));
        }
      }
      const fetched = await Promise.all(tasks);
      for (const batch of fetched) candidates.push(...(batch ?? []));

      const results = this.sortAndDedup(candidates, museumMode === true);

      if (!fetched.includes(null)) {
        this.evictIfNeeded();
        this.cache.set(cacheKey, {
          images: results,
          expiresAt: Date.now() + this.config.cacheTtlMs,
        });
      }

      logger.info('image_enrichment_success', { searchTerms: cleaned, count: results.length });
      return results;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('image_enrichment_error', { searchTerms: cleaned, error: msg });
      return [];
    }
  }

  mergeWikidataImage(
    existing: EnrichedImage[],
    wikidataImageUrl: string,
    searchTerm: string,
  ): EnrichedImage[] {
    if (existing.some((img) => img.url === wikidataImageUrl)) return existing;

    const merged = [...existing, this.buildWikidataCandidate(wikidataImageUrl, searchTerm)];
    merged.sort((a, b) => b.score - a.score);

    const seen = new Set<string>();
    return merged.filter((img) => {
      if (seen.has(img.url)) return false;
      seen.add(img.url);
      return true;
    });
  }

  private getFromCache(key: string): EnrichedImage[] | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (Date.now() < cached.expiresAt) {
      logger.info('image_enrichment_cache_hit', { searchTerm: key });
      return cached.images;
    }
    this.cache.delete(key);
    return null;
  }

  private buildWikidataCandidate(
    imageUrl: string,
    searchTerm: string,
    annotation?: SuggestedImageAnnotation,
  ): EnrichedImage {
    const candidate: ImageCandidate = { caption: searchTerm, source: 'wikidata', apiPosition: 0 };
    // `||` (not `??`) is intentional: annotation.caption may be the empty
    // string when the LLM omitted the field — we want to fall back to the
    // searchTerm in that case, not retain an empty caption.
    const captionFallback =
      annotation?.caption !== undefined && annotation.caption.length > 0
        ? annotation.caption
        : searchTerm;
    return {
      url: imageUrl,
      thumbnailUrl: imageUrl,
      caption: captionFallback,
      rationale: annotation?.rationale ?? '',
      source: 'wikidata',
      score: scoreImage(candidate, searchTerm),
    };
  }

  private async fetchSourcePhotos(
    client: ImageSourceClient,
    source: EnrichedImageSource,
    searchTerm: string,
    annotation: SuggestedImageAnnotation | undefined,
  ): Promise<EnrichedImage[] | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const photos = await Promise.race([
        client.searchPhotos(searchTerm),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('IMAGE_ENRICHMENT_TIMEOUT'));
          }, this.config.fetchTimeoutMs);
        }),
      ]);
      return photos.map((photo, index) =>
        mapPhotoToEnriched(photo, index, source, searchTerm, annotation),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`image_enrichment_${source}_failed`, { searchTerm, error: msg });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private sortAndDedup(candidates: EnrichedImage[], museumMode: boolean): EnrichedImage[] {
    candidates.sort((a, b) => b.score - a.score);

    const byUrl = new Map<string, EnrichedImage>();
    for (const img of candidates) {
      const existing = byUrl.get(img.url);
      if (!existing) {
        byUrl.set(img.url, img);
        continue;
      }
      // Tie-break: keep higher source-priority, falling back to higher score.
      const existingRank = SOURCE_PRIORITY[existing.source];
      const incomingRank = SOURCE_PRIORITY[img.source];
      if (
        incomingRank > existingRank ||
        (incomingRank === existingRank && img.score > existing.score)
      ) {
        byUrl.set(img.url, img);
      }
    }

    let deduped = Array.from(byUrl.values());
    deduped.sort((a, b) => b.score - a.score);

    // R13 — pin Musaium catalogue hit to position 0 when museumMode is on.
    if (museumMode) {
      const museumIdx = deduped.findIndex((img) => img.source === 'musaium');
      if (museumIdx > 0) {
        const [pinned] = deduped.splice(museumIdx, 1);
        deduped = [pinned, ...deduped];
      }
    }

    return deduped.slice(0, this.config.maxImagesPerResponse);
  }

  private evictIfNeeded(): void {
    if (this.cache.size < this.config.cacheMaxEntries) return;
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey !== undefined) {
      this.cache.delete(oldestKey);
    }
  }
}

function buildAnnotationLookup(
  annotations?: readonly SuggestedImageAnnotation[],
): Map<string, SuggestedImageAnnotation> {
  const map = new Map<string, SuggestedImageAnnotation>();
  if (!annotations) return map;
  for (const ann of annotations) {
    map.set(ann.query.toLowerCase().trim(), ann);
  }
  return map;
}

function mapPhotoToEnriched(
  photo: ImageSourcePhoto,
  index: number,
  source: EnrichedImageSource,
  searchTerm: string,
  annotation: SuggestedImageAnnotation | undefined,
): EnrichedImage {
  const candidate: ImageCandidate = {
    caption: photo.caption,
    source,
    width: photo.width,
    height: photo.height,
    apiPosition: index,
  };
  const score =
    source === 'musaium'
      ? 1 // Decision D4: musaium pins to score=1.0 to keep the 0..1 range.
      : scoreImage(candidate, searchTerm);

  const caption =
    source === 'unsplash' ? photo.caption : pickNonUnsplashCaption(photo, annotation, searchTerm);

  return {
    url: photo.url,
    thumbnailUrl: photo.thumbnailUrl,
    caption,
    rationale: annotation?.rationale ?? '',
    source,
    score,
    ...buildAttribution(source, photo.photographerName),
  };
}

function buildAttribution(
  source: EnrichedImageSource,
  photographerName: string,
): { attribution?: string } {
  if (!photographerName) return {};
  if (source === 'unsplash') return { attribution: `Photo by ${photographerName} on Unsplash` };
  if (source === 'commons') return { attribution: photographerName };
  return {};
}

function pickNonUnsplashCaption(
  photo: ImageSourcePhoto,
  annotation: SuggestedImageAnnotation | undefined,
  searchTerm: string,
): string {
  const llmCaption = annotation?.caption;
  if (llmCaption !== undefined && llmCaption.length > 0) return llmCaption;
  if (photo.caption.length > 0) return photo.caption;
  return searchTerm;
}
