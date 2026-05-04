import { logger } from '@shared/logger/logger';

import type {
  ImageSourceClient,
  ImageSourcePhoto,
} from '@modules/chat/domain/ports/image-source.port';

/** @deprecated Use `ImageSourcePhoto` from the port instead. Kept for backward compatibility. */
export type UnsplashPhoto = ImageSourcePhoto;

/** Unsplash API client for searching artwork-related photos. Never throws from public methods. */
export class UnsplashClient implements ImageSourceClient {
  private readonly baseUrl = 'https://api.unsplash.com';

  constructor(private readonly accessKey: string) {}

  /** Searches Unsplash for photos matching the query. Returns `[]` on any failure. */
  async searchPhotos(query: string, perPage = 5): Promise<ImageSourcePhoto[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 3000);

    try {
      const url = `${this.baseUrl}/search/photos?query=${encodeURIComponent(query)}&per_page=${String(perPage)}&orientation=landscape`;
      const res = await fetch(url, {
        headers: { Authorization: `Client-ID ${this.accessKey}` },
        signal: controller.signal,
      });

      if (!res.ok) {
        logger.warn('unsplash_search_error', { status: res.status, query });
        return [];
      }

      const data = (await res.json()) as { results?: unknown[] };
      if (!Array.isArray(data.results)) return [];

      return data.results
        .filter((r): r is Record<string, unknown> => r != null && typeof r === 'object')
        .map((r) => this.mapResult(r))
        .filter((p): p is ImageSourcePhoto => p !== null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'This operation was aborted') {
        logger.warn('unsplash_search_failed', { query, error: msg });
      }
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private mapResult(r: Record<string, unknown>): ImageSourcePhoto | null {
    const urls = r.urls as Record<string, unknown> | undefined;
    const user = r.user as Record<string, unknown> | undefined;
    if (!urls || typeof urls.regular !== 'string' || typeof urls.small !== 'string') return null;

    return {
      url: urls.regular,
      thumbnailUrl: urls.small,
      caption:
        (typeof r.description === 'string' ? r.description : null) ??
        (typeof r.alt_description === 'string' ? r.alt_description : ''),
      width: typeof r.width === 'number' ? r.width : 0,
      height: typeof r.height === 'number' ? r.height : 0,
      photographerName: user && typeof user.name === 'string' ? user.name : 'Unknown',
    };
  }
}
