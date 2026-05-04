import { scoreImage } from '@modules/chat/useCase/image/image-scoring';
import { logger } from '@shared/logger/logger';

import type { EnrichedImage } from '@modules/chat/domain/chat.types';
import type {
  ImageSourceClient,
  ImageSourcePhoto,
} from '@modules/chat/domain/ports/image-source.port';
import type { ImageCandidate } from '@modules/chat/useCase/image/image-scoring';

/** Configuration for the image enrichment service. */
export interface ImageEnrichmentConfig {
  cacheTtlMs: number;
  cacheMaxEntries: number;
  fetchTimeoutMs: number;
  maxImagesPerResponse: number;
}

/** Internal cache entry storing enriched images and expiration timestamp. */
interface CacheEntry {
  images: EnrichedImage[];
  expiresAt: number;
}

/**
 * Image enrichment service with in-memory cache, timeout, and fail-open behavior.
 *
 * Aggregates images from Wikidata (P18) and Unsplash, scores them for relevance,
 * and returns a ranked, deduplicated list. Any failure returns `[]`.
 */
export class ImageEnrichmentService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly unsplashClient: ImageSourceClient | undefined,
    private readonly config: ImageEnrichmentConfig,
  ) {}

  /**
   * Enriches a search term with images from Wikidata and Unsplash.
   *
   * @param searchTerm - Artwork or topic name to search images for.
   * @param wikidataImageUrl - Optional image URL from Wikidata P18 property.
   * @returns Scored and ranked enriched images, or `[]` on any failure.
   */
  async enrich(searchTerm: string, wikidataImageUrl?: string): Promise<EnrichedImage[]> {
    try {
      const key = searchTerm.toLowerCase().trim();
      if (!key) return [];

      const cached = this.getFromCache(key);
      if (cached) return cached;

      const candidates: EnrichedImage[] = [];

      if (wikidataImageUrl) {
        candidates.push(this.buildWikidataCandidate(wikidataImageUrl, searchTerm));
      }

      await this.fetchUnsplashCandidates(searchTerm, key, candidates);

      const results = this.sortAndDedup(candidates);

      this.evictIfNeeded();
      this.cache.set(key, { images: results, expiresAt: Date.now() + this.config.cacheTtlMs });

      logger.info('image_enrichment_success', { searchTerm: key, count: results.length });
      return results;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('image_enrichment_error', { searchTerm, error: msg });
      return [];
    }
  }

  /**
   * Merges a Wikidata image into an existing enriched images list.
   * Re-sorts by score and deduplicates by URL.
   *
   * @param existing - Current list of enriched images.
   * @param wikidataImageUrl - Wikidata P18 image URL to add.
   * @param searchTerm - Search term for scoring.
   * @returns Merged, sorted, and deduplicated enriched images.
   */
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

  private buildWikidataCandidate(imageUrl: string, searchTerm: string): EnrichedImage {
    const candidate: ImageCandidate = { caption: searchTerm, source: 'wikidata', apiPosition: 0 };
    return {
      url: imageUrl,
      thumbnailUrl: imageUrl,
      caption: searchTerm,
      source: 'wikidata',
      score: scoreImage(candidate, searchTerm),
    };
  }

  private async fetchUnsplashCandidates(
    searchTerm: string,
    key: string,
    candidates: EnrichedImage[],
  ): Promise<void> {
    if (!this.unsplashClient) return;

    try {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const photos = await Promise.race([
        this.unsplashClient.searchPhotos(searchTerm),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('IMAGE_ENRICHMENT_TIMEOUT'));
          }, this.config.fetchTimeoutMs);
        }),
      ]).finally(() => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      });

      for (let i = 0; i < photos.length; i++) {
        candidates.push(this.mapUnsplashPhoto(photos[i], i, searchTerm));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('image_enrichment_unsplash_failed', { searchTerm: key, error: msg });
    }
  }

  private mapUnsplashPhoto(
    photo: ImageSourcePhoto,
    index: number,
    searchTerm: string,
  ): EnrichedImage {
    const candidate: ImageCandidate = {
      caption: photo.caption,
      source: 'unsplash',
      width: photo.width,
      height: photo.height,
      apiPosition: index,
    };
    return {
      url: photo.url,
      thumbnailUrl: photo.thumbnailUrl,
      caption: photo.caption,
      source: 'unsplash',
      score: scoreImage(candidate, searchTerm),
      attribution: `Photo by ${photo.photographerName} on Unsplash`,
    };
  }

  private sortAndDedup(candidates: EnrichedImage[]): EnrichedImage[] {
    candidates.sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    const results: EnrichedImage[] = [];
    for (const img of candidates) {
      if (seen.has(img.url)) continue;
      seen.add(img.url);
      results.push(img);
      if (results.length >= this.config.maxImagesPerResponse) break;
    }
    return results;
  }

  private evictIfNeeded(): void {
    if (this.cache.size < this.config.cacheMaxEntries) return;
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey !== undefined) {
      this.cache.delete(oldestKey);
    }
  }
}
