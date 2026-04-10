import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';

import { Readability } from '@mozilla/readability';
import * as cheerio from 'cheerio';
import { parseHTML } from 'linkedom';

import { logger } from '@shared/logger/logger';

import type { ScrapedPage, ScraperPort } from '../../domain/ports/scraper.port';

/**
 * Configuration for the HTML scraper adapter.
 */
export interface HtmlScraperConfig {
  timeoutMs: number;
  maxContentBytes: number;
}

const ALLOWED_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'];
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const USER_AGENT = 'MusaiumBot/1.0 (+https://musaium.app; museum-knowledge-enrichment)';

/** Returns true if the IP address belongs to a private or reserved range. */
function isPrivateIp(ip: string): boolean {
  // IPv4
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('0.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('169.254.')) return true;
  if (ip.startsWith('172.')) {
    const second = Number.parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  // IPv6 loopback and private
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) {
    return true;
  }
  return false;
}

/**
 * HTML scraper adapter implementing {@link ScraperPort}.
 *
 * Uses native `fetch` (Node 18+) and Mozilla Readability for article extraction,
 * falling back to cheerio-based body text extraction for non-article pages.
 * Never throws from public methods — any error returns null so the caller can fail-open.
 */
export class HtmlScraper implements ScraperPort {
  constructor(private readonly config: HtmlScraperConfig) {}

  /** Validates URL against SSRF: checks protocol and rejects private/reserved IPs. */
  private async validateUrl(url: string): Promise<boolean> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      logger.warn('scraper_ssrf_blocked', { url, reason: 'invalid_url' });
      return false;
    }

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      logger.warn('scraper_ssrf_blocked', {
        url,
        reason: 'disallowed_protocol',
        protocol: parsed.protocol,
      });
      return false;
    }

    try {
      const { address } = await lookup(parsed.hostname);
      if (isPrivateIp(address)) {
        logger.warn('scraper_ssrf_blocked', { url, reason: 'private_ip', ip: address });
        return false;
      }
    } catch {
      logger.warn('scraper_ssrf_blocked', { url, reason: 'dns_resolution_failed' });
      return false;
    }

    return true;
  }

  /** Scrapes the given URL, returning extracted content or null on failure. */
  async scrape(url: string, signal?: AbortSignal): Promise<ScrapedPage | null> {
    if (!url.trim()) return null;

    try {
      const urlAllowed = await this.validateUrl(url);
      if (!urlAllowed) return null;
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
