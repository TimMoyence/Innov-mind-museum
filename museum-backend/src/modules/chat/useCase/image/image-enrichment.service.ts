import { THUMBNAIL_WIDTH_PX } from '@modules/chat/domain/ports/image-source.port';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { wikimediaHttps } from '@shared/media/wikimedia-https';

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

export interface SuggestedImageAnnotation {
  query: string;
  caption: string;
  rationale: string;
}

const SOURCE_PRIORITY: Record<EnrichedImageSource, number> = {
  musaium: 4,
  wikidata: 3,
  commons: 2,
  unsplash: 1,
};

export class ImageEnrichmentService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly unsplashClient: ImageSourceClient | undefined,
    private readonly config: ImageEnrichmentConfig,
    private readonly commonsClient?: ImageSourceClient | undefined,
    private readonly musaiumClient?: ImageSourceClient | undefined,
  ) {}

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
      const msg = errorMessage(err);
      logger.warn('image_enrichment_error', { searchTerms: cleaned, error: msg });
      return [];
    }
  }

  mergeWikidataImage(
    existing: EnrichedImage[],
    wikidataImageUrl: string,
    searchTerm: string,
  ): EnrichedImage[] {
    const candidate = this.buildWikidataCandidate(wikidataImageUrl, searchTerm);
    if (existing.some((img) => img.url === candidate.url)) return existing;

    const merged = [...existing, candidate];
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
    wikidataImageUrl: string,
    searchTerm: string,
    annotation?: SuggestedImageAnnotation,
  ): EnrichedImage {
    const imageUrl = wikimediaHttps(wikidataImageUrl);
    const candidate: ImageCandidate = { caption: searchTerm, source: 'wikidata', apiPosition: 0 };
    const captionFallback =
      annotation?.caption !== undefined && annotation.caption.length > 0
        ? annotation.caption
        : searchTerm;
    return {
      url: imageUrl,
      thumbnailUrl: `${imageUrl}?width=${String(THUMBNAIL_WIDTH_PX)}`,
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
      const msg = errorMessage(err);
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
  const score = source === 'musaium' ? 1 : scoreImage(candidate, searchTerm);

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
