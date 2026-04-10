import { createHash } from 'node:crypto';

import { Readability } from '@mozilla/readability';
import * as cheerio from 'cheerio';
import { parseHTML } from 'linkedom';

import { logger } from '@shared/logger/logger';

import type { ScrapedPage, ScraperPort } from '../../domain/ports/scraper.port';

/**
 *
 */
export interface HtmlScraperConfig {
  timeoutMs: number;
  maxContentBytes: number;
}

const ALLOWED_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'];
const USER_AGENT = 'MusaiumBot/1.0 (+https://musaium.app; museum-knowledge-enrichment)';

/**
 * HTML scraper adapter implementing {@link ScraperPort}.
 *
 * Uses native `fetch` (Node 18+) and Mozilla Readability for article extraction,
 * falling back to cheerio-based body text extraction for non-article pages.
 * Never throws from public methods — any error returns null so the caller can fail-open.
 */
export class HtmlScraper implements ScraperPort {
  constructor(private readonly config: HtmlScraperConfig) {}

  /** Scrapes the given URL, returning extracted content or null on failure. */
  async scrape(url: string, signal?: AbortSignal): Promise<ScrapedPage | null> {
    if (!url.trim()) return null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, this.config.timeoutMs);

      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            controller.abort();
          },
          { once: true },
        );
      }

      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: controller.signal,
          redirect: 'follow',
        });

        if (!response.ok) {
          logger.warn('scraper_http_error', { url, status: response.status });
          return null;
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!ALLOWED_CONTENT_TYPES.some((ct) => contentType.includes(ct))) {
          logger.info('scraper_skip_non_html', { url, contentType });
          return null;
        }

        const html = await response.text();
        return this.extractContent(url, html);
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      logger.warn('scraper_exception', {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private extractContent(url: string, html: string): ScrapedPage | null {
    const { document } = parseHTML(html);
    const reader = new Readability(document);
    const article = reader.parse();

    if (!article?.textContent) {
      // Fallback: cheerio-based body extraction for non-article pages
      const $ = cheerio.load(html);
      $('script, style, nav, footer, header').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim();
      if (!text) return null;

      const truncated = text.slice(0, this.config.maxContentBytes);
      return {
        url,

        title: $('title').text().trim() || url,
        textContent: truncated,
        contentHash: createHash('sha256').update(truncated).digest('hex').slice(0, 16),
      };
    }

    const textContent = article.textContent
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, this.config.maxContentBytes);

    return {
      url,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- intentionally treating empty string as falsy
      title: article.title || url,
      textContent,
      contentHash: createHash('sha256').update(textContent).digest('hex').slice(0, 16),
    };
  }
}
