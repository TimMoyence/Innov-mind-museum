import type {
  ImageSourceClient,
  ImageSourcePhoto,
} from '@modules/chat/domain/ports/image-source.port';

export class UnsplashClient implements ImageSourceClient {
  private readonly baseUrl = 'https://api.unsplash.com';

  constructor(private readonly accessKey: string) {}

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

      if (!res.ok) throw new Error(`unsplash_search_http_${String(res.status)}`);

      const data = (await res.json()) as { results?: unknown[] };
      if (!Array.isArray(data.results)) throw new Error('unsplash_search_malformed');

      return data.results
        .filter((r): r is Record<string, unknown> => r != null && typeof r === 'object')
        .map((r) => this.mapResult(r))
        .filter((p): p is ImageSourcePhoto => p !== null);
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
