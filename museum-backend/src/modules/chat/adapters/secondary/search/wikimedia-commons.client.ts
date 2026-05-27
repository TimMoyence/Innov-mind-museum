import { logger } from '@shared/logger/logger';

import type {
  ImageSourceClient,
  ImageSourcePhoto,
} from '@modules/chat/domain/ports/image-source.port';

/**
 * C2 v2 (2026-05). Mirrors UnsplashClient pattern: AbortController hard timeout, fail-open
 * (`[]`). OSMF policy mandates descriptive User-Agent (matches WikidataClient header).
 * Public endpoint, fixed host — no SSRF surface.
 */
export class WikimediaCommonsClient implements ImageSourceClient {
  private readonly searchUrl = 'https://commons.wikimedia.org/w/api.php';
  private readonly userAgent = 'Musaium/1.0 (https://musaium.com; contact@musaium.com)';
  private readonly timeoutMs: number;

  constructor(timeoutMs = 3000) {
    this.timeoutMs = timeoutMs;
  }

  /** `query` is LLM-produced (not visitor-controlled). `perPage` capped server-side at 50. */
  async searchPhotos(query: string, perPage = 5): Promise<ImageSourcePhoto[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const titles = await this.searchFileTitles(trimmed, perPage, controller.signal);
      if (titles.length === 0) return [];
      return await this.fetchImageInfo(titles, controller.signal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'This operation was aborted') {
        logger.warn('image_enrichment_commons_failed', { query: trimmed, error: msg });
      }
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private async searchFileTitles(
    query: string,
    perPage: number,
    signal: AbortSignal,
  ): Promise<string[]> {
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srnamespace: '6', // File: namespace
      srlimit: String(Math.min(Math.max(perPage, 1), 50)),
      format: 'json',
      origin: '*',
    });
    const res = await fetch(`${this.searchUrl}?${params.toString()}`, {
      headers: { 'User-Agent': this.userAgent },
      signal,
    });
    if (!res.ok) {
      logger.warn('image_enrichment_commons_failed', {
        query,
        error: `HTTP ${String(res.status)}`,
      });
      return [];
    }
    const data = (await res.json()) as { query?: { search?: { title?: unknown }[] } };
    const search = data.query?.search;
    if (!Array.isArray(search)) return [];
    return search
      .map((row) => (typeof row.title === 'string' ? row.title : null))
      .filter((title): title is string => title !== null);
  }

  private async fetchImageInfo(titles: string[], signal: AbortSignal): Promise<ImageSourcePhoto[]> {
    const params = new URLSearchParams({
      action: 'query',
      titles: titles.join('|'),
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size',
      format: 'json',
      origin: '*',
    });
    const res = await fetch(`${this.searchUrl}?${params.toString()}`, {
      headers: { 'User-Agent': this.userAgent },
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: { pages?: Record<string, unknown> };
    };
    const pages = data.query?.pages;
    if (!pages || typeof pages !== 'object') return [];
    return Object.values(pages)
      .map((page) => this.mapPage(page))
      .filter((p): p is ImageSourcePhoto => p !== null);
  }

  private mapPage(page: unknown): ImageSourcePhoto | null {
    const info = extractImageInfo(page);
    if (!info) return null;
    const meta = extractMeta(info);
    const caption = pickCaption(info, meta, page);
    return {
      url: info.url,
      thumbnailUrl: info.thumbnailUrl,
      caption,
      width: typeof info.width === 'number' ? info.width : 0,
      height: typeof info.height === 'number' ? info.height : 0,
      photographerName: pickPhotographer(meta),
    };
  }
}

interface ParsedImageInfo {
  url: string;
  thumbnailUrl: string;
  width?: number;
  height?: number;
  extmetadata?: Record<string, { value?: unknown }>;
}

function extractImageInfo(page: unknown): ParsedImageInfo | null {
  if (!page || typeof page !== 'object') return null;
  const p = page as Record<string, unknown>;
  const infos = p.imageinfo;
  if (!Array.isArray(infos) || infos.length === 0) return null;
  const info = infos[0] as Record<string, unknown>;
  const url = typeof info.url === 'string' ? info.url : null;
  if (!url) return null;
  const thumb = typeof info.thumburl === 'string' ? info.thumburl : url;
  return {
    url,
    thumbnailUrl: thumb,
    width: typeof info.width === 'number' ? info.width : undefined,
    height: typeof info.height === 'number' ? info.height : undefined,
    extmetadata:
      info.extmetadata && typeof info.extmetadata === 'object'
        ? (info.extmetadata as Record<string, { value?: unknown }>)
        : undefined,
  };
}

interface CommonsMeta {
  description: string;
  objectName: string;
  author: string;
  license: string;
}

function extractMeta(info: ParsedImageInfo): CommonsMeta {
  const meta = info.extmetadata ?? {};
  return {
    description: readMetaValue(meta.ImageDescription),
    objectName: readMetaValue(meta.ObjectName),
    author: readMetaValue(meta.Artist),
    license: readMetaValue(meta.LicenseShortName),
  };
}

function pickCaption(_info: ParsedImageInfo, meta: CommonsMeta, page: unknown): string {
  const fromDescription = stripHtml(meta.description);
  if (fromDescription) return fromDescription;
  const fromName = stripHtml(meta.objectName);
  if (fromName) return fromName;
  const p = page as Record<string, unknown>;
  return typeof p.title === 'string' ? p.title.replace(/^File:/, '') : '';
}

function pickPhotographer(meta: CommonsMeta): string {
  const author = stripHtml(meta.author);
  if (author) return author;
  const license = stripHtml(meta.license);
  return license ? `via ${license}` : 'Wikimedia Commons';
}

function readMetaValue(field: unknown): string {
  if (!field || typeof field !== 'object') return '';
  const value = (field as { value?: unknown }).value;
  return typeof value === 'string' ? value : '';
}

/** Minimal HTML strip — Commons returns rich HTML in extmetadata. */
function stripHtml(html: string): string {
  return (
    html
      // eslint-disable-next-line sonarjs/slow-regex -- Justification: bounded by negated class `[^>]+` with single quantifier; not nested, no backtracking risk; payload is third-party Commons HTML capped by API response size. Approved-by: tim@2026-05-10
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
