import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIPv4 } from 'node:net';

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
const MAX_REDIRECTS = 5;

/**
 * Hostnames that resolve to cloud-provider metadata endpoints. The IPv4
 * short-circuit on `169.254.0.0/16` already blocks them, but we reject the
 * DNS name before lookup to make policy violations visible in logs.
 */
const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'metadata.azure.com',
  'metadata.packet.net',
  'instance-data',
]);

/**
 * Decodes an IPv4-mapped IPv6 address back to its IPv4 dotted form.
 *
 * Handles two wire shapes that point at the same network:
 *   - Decimal:                 `::ffff:127.0.0.1`
 *   - WHATWG-canonicalised hex: `::ffff:7f00:1` (Node URL parser emits this)
 *
 * Returns `null` when the input is not an IPv4-mapped IPv6 literal so callers
 * can keep treating the address as a generic IPv6.
 *
 * Why: previously `normalizeIp` only stripped the `::ffff:` prefix and relied
 * on string-prefix checks (`startsWith('127.')`). The hex form bypassed every
 * range test (`7f00:1` matches no IPv4 prefix), opening an SSRF path on the
 * scraper. Tracked as W1.T2-followup; see ssrf-matrix tests cases 10-11.
 */
function ipv6MappedToIpv4(address: string): string | null {
  const HEX_FORM = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;
  const hexMatch = HEX_FORM.exec(address);
  if (hexMatch) {
    const high = Number.parseInt(hexMatch[1], 16);
    const low = Number.parseInt(hexMatch[2], 16);
    if (
      Number.isFinite(high) &&
      Number.isFinite(low) &&
      high >= 0 &&
      high <= 0xffff &&
      low >= 0 &&
      low <= 0xffff
    ) {
      const a = (high >> 8) & 0xff;
      const b = high & 0xff;
      const c = (low >> 8) & 0xff;
      const d = low & 0xff;
      return `${a}.${b}.${c}.${d}`;
    }
  }
  if (address.startsWith('::ffff:')) {
    const tail = address.slice(7);
    if (isIPv4(tail)) return tail;
  }
  return null;
}

/**
 * Normalises an IP-like string:
 *   - Strips IPv6 URL brackets: `[::1]` → `::1`
 *   - Unwraps IPv4-mapped IPv6 in BOTH wire shapes (decimal `::ffff:1.2.3.4`
 *     and hex-canonical `::ffff:0102:0304`) so range checks below see a single
 *     dotted IPv4.
 *   - Lowercases hex digits
 */
function normalizeIp(address: string): string {
  let value = address.toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) {
    value = value.slice(1, -1);
  }
  const unwrapped = ipv6MappedToIpv4(value);
  if (unwrapped) {
    return unwrapped;
  }
  return value;
}

/** Returns true if the IP belongs to a private, reserved, loopback, or link-local range. */
function isPrivateIp(rawIp: string): boolean {
  const ip = normalizeIp(rawIp);
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('0.')) return true;
  if (ip.startsWith('192.168.')) return true;
  // 169.254.0.0/16 covers AWS/Azure/GCP IMDS at 169.254.169.254
  if (ip.startsWith('169.254.')) return true;
  if (ip.startsWith('172.')) {
    const second = Number.parseInt(ip.split('.')[1] ?? '', 10);
    if (Number.isFinite(second) && second >= 16 && second <= 31) return true;
  }
  // IPv6 loopback (::1), ULA (fc00::/7), link-local (fe80::/10)
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) {
    return true;
  }
  return false;
}

type HostnameCheck =
  | { ok: true; address: string }
  | {
      ok: false;
      reason: 'blocked_hostname' | 'private_ip' | 'dns_resolution_failed';
      address?: string;
    };

/**
 * Matches a dotted IPv4 literal. Written as four fixed octet groups (no nested
 * quantifier) so `eslint-plugin-security/detect-unsafe-regex` stays clear —
 * the anchored form with `{1,3}` is still not backtrack-prone, but expanding it
 * removes the false-positive at the source.
 */
const IPV4_LITERAL = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/**
 * Resolves a hostname and classifies it as safe or unsafe (SSRF-wise).
 * Called at every redirect hop to block `302 → internal IP` bypasses.
 *
 * When the `hostname` is already an IP literal (IPv4 dotted or IPv6 in
 * brackets stripped by `URL.hostname`), DNS lookup is skipped — it would
 * resolve to itself and adds no value. This also closes a subtle bypass
 * where `169.254.169.254` as a literal would otherwise hit whatever the
 * system DNS resolver returned for the string form.
 */
async function validateHostname(hostname: string): Promise<HostnameCheck> {
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    return { ok: false, reason: 'blocked_hostname' };
  }
  // IPv6 literals come out of URL.hostname without brackets.
  const isIpLiteral = IPV4_LITERAL.test(hostname) || hostname.includes(':');
  if (isIpLiteral) {
    const normalized = normalizeIp(hostname);
    if (isPrivateIp(normalized)) {
      return { ok: false, reason: 'private_ip', address: normalized };
    }
    return { ok: true, address: normalized };
  }
  try {
    const { address } = await lookup(hostname);
    const normalized = normalizeIp(address);
    if (isPrivateIp(normalized)) {
      return { ok: false, reason: 'private_ip', address: normalized };
    }
    return { ok: true, address: normalized };
  } catch {
    return { ok: false, reason: 'dns_resolution_failed' };
  }
}

/** Drains a response body so the keep-alive TCP connection can be reused. Silent on error. */
async function drainResponseBody(response: Response): Promise<void> {
  try {
    await response.arrayBuffer();
  } catch {
    // best-effort
  }
}

type RedirectOutcome =
  | { blocked: true; reason: string; hop: number }
  | { blocked: false; response: Response; finalUrl: string };

/**
 * Performs `fetch` with a manual redirect loop so each `Location` header is
 * re-validated against the SSRF policy. Closes DNS rebinding + cloud metadata
 * + scheme-downgrade bypasses that a single pre-fetch check misses.
 */
async function fetchWithSafeRedirects(
  initialUrl: string,
  init: RequestInit,
): Promise<RedirectOutcome> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(currentUrl, { ...init, redirect: 'manual' });
    const isRedirect =
      response.status >= 300 && response.status < 400 && response.headers.has('location');
    if (!isRedirect) {
      return { blocked: false, response, finalUrl: currentUrl };
    }
    if (hop === MAX_REDIRECTS) {
      await drainResponseBody(response);
      return { blocked: true, reason: 'too_many_redirects', hop };
    }
    const locationHeader = response.headers.get('location') ?? '';
    let nextUrl: URL;
    try {
      nextUrl = new URL(locationHeader, currentUrl);
    } catch {
      await drainResponseBody(response);
      return { blocked: true, reason: 'invalid_redirect_url', hop };
    }
    if (!ALLOWED_PROTOCOLS.has(nextUrl.protocol)) {
      await drainResponseBody(response);
      return { blocked: true, reason: 'redirect_disallowed_protocol', hop };
    }
    const check = await validateHostname(nextUrl.hostname);
    if (!check.ok) {
      await drainResponseBody(response);
      return { blocked: true, reason: `redirect_${check.reason}`, hop };
    }
    await drainResponseBody(response);
    currentUrl = nextUrl.href;
  }
  return { blocked: true, reason: 'too_many_redirects', hop: MAX_REDIRECTS };
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

  /**
   * Validates the *initial* URL against SSRF policy. Each redirect hop is
   * re-validated inside {@link fetchWithSafeRedirects}.
   */
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

    const check = await validateHostname(parsed.hostname);
    if (!check.ok) {
      logger.warn('scraper_ssrf_blocked', {
        url,
        reason: check.reason,
        ip: check.address,
      });
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
        const outcome = await fetchWithSafeRedirects(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: controller.signal,
        });

        if (outcome.blocked) {
          logger.warn('scraper_ssrf_blocked', {
            url,
            reason: outcome.reason,
            hop: outcome.hop,
          });
          return null;
        }

        const { response, finalUrl } = outcome;

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
        return this.extractContent(finalUrl, html);
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
