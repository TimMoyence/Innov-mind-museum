import { logger } from '@shared/logger/logger';

const USER_AGENT = 'Musaium/1.0 (https://musaium.app; contact@musaium.app)';
const DEFAULT_TIMEOUT_MS = 5_000;

/** Wikipedia REST summary — minimal projection we need. */
export interface WikipediaSummary {
  title: string;
  extract: string;
  extractHtml: string | null;
  pageUrl: string;
}

/** Port-like interface so the use case + tests can substitute a stub client. */
export interface WikipediaClient {
  fetchSummary(input: { title: string; locale: string }): Promise<WikipediaSummary | null>;
}

function isValidLanguageCode(lang: string): boolean {
  return /^[a-z]{2,3}$/i.test(lang);
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Default HTTP-backed implementation. Fail-open on every error path. */
export class HttpWikipediaClient implements WikipediaClient {
  /**
   * Fetches the lead-section summary for `title` from the localised Wikipedia
   * REST endpoint. Returns `null` on any failure (bad locale, 404, timeout,
   * malformed JSON) so the caller can silently degrade.
   */
  async fetchSummary(input: { title: string; locale: string }): Promise<WikipediaSummary | null> {
    if (!input.title.trim()) return null;
    const language = isValidLanguageCode(input.locale) ? input.locale.toLowerCase() : 'en';
    const url = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(input.title)}`;
    try {
      const res = await fetchWithTimeout(url, DEFAULT_TIMEOUT_MS);
      if (!res.ok) return null;
      const data = (await res.json()) as {
        title?: string;
        extract?: string;
        extract_html?: string;
        content_urls?: { desktop?: { page?: string } };
      };
      if (!data.title || !data.extract) return null;
      return {
        title: data.title,
        extract: data.extract,
        extractHtml: data.extract_html ?? null,
        pageUrl:
          data.content_urls?.desktop?.page ??
          `https://${language}.wikipedia.org/wiki/${encodeURIComponent(data.title)}`,
      };
    } catch (err) {
      logger.warn('wikipedia_summary_error', {
        title: input.title,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}
