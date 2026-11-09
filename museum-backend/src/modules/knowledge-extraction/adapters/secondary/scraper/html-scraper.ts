import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIPv4 } from 'node:net';

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { nonEmpty } from '@shared/utils/defaults';

import type {
  ScrapedPage,
  ScraperPort,
} from '@modules/knowledge-extraction/domain/ports/scraper.port';

export interface HtmlScraperConfig {
  timeoutMs: number;
  maxContentBytes: number;
}

const ALLOWED_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'];
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const USER_AGENT = 'MusaiumBot/1.0 (+https://musaium.com; museum-knowledge-enrichment)';
const MAX_REDIRECTS = 5;

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'metadata.azure.com',
  'metadata.packet.net',
  'instance-data',
]);

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
      return [a, b, c, d].join('.');
    }
  }
  if (address.startsWith('::ffff:')) {
    const tail = address.slice(7);
    if (isIPv4(tail)) return tail;
  }
  return null;
}

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

function isPrivateIpv4(ip: string): boolean {
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('0.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('169.254.')) return true;
  if (ip.startsWith('172.')) {
    const second = Number.parseInt(ip.split('.')[1] ?? '', 10);
    if (Number.isFinite(second) && second >= 16 && second <= 31) return true;
  }
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  return ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80');
}

function isPrivateIp(rawIp: string): boolean {
  const ip = normalizeIp(rawIp);
  return isPrivateIpv4(ip) || isPrivateIpv6(ip);
}

type HostnameCheck =
  | { ok: true; address: string }
  | {
      ok: false;
      reason: 'blocked_hostname' | 'private_ip' | 'dns_resolution_failed';
      address?: string;
    };

const IPV4_LITERAL = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

async function validateHostname(hostname: string): Promise<HostnameCheck> {
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    return { ok: false, reason: 'blocked_hostname' };
  }
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

async function drainResponseBody(response: Response): Promise<void> {
  try {
    await response.arrayBuffer();
  } catch {}
}

type RedirectOutcome =
  | { blocked: true; reason: string; hop: number }
  | { blocked: false; response: Response; finalUrl: string };

type StreamedBodyResult = { ok: true; html: string } | { ok: false };

async function readBodyWithCap(
  response: Response,
  url: string,
  maxContentBytes: number,
): Promise<StreamedBodyResult> {
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const declared = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declared) && declared > maxContentBytes) {
      logger.warn('scraper_payload_too_large', {
        url,
        contentLength: declared,
        maxContentBytes,
      });
      return { ok: false };
    }
  }

  const body = response.body;
  if (!body) {
    logger.warn('scraper_no_body', { url });
    return { ok: false };
  }
  const reader = body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let bytesRead = 0;
  let html = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const value = chunk.value;
      bytesRead += value.byteLength;
      if (bytesRead > maxContentBytes) {
        logger.warn('scraper_payload_streamed_overflow', {
          url,
          bytesReadBeforeAbort: bytesRead,
          maxContentBytes,
        });
        await reader.cancel();
        return { ok: false };
      }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
  } catch (streamErr) {
    logger.warn('scraper_stream_error', {
      url,
      error: errorMessage(streamErr),
    });
    return { ok: false };
  }
  return { ok: true, html };
}

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

export class HtmlScraper implements ScraperPort {
  constructor(private readonly config: HtmlScraperConfig) {}

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

        const bodyResult = await readBodyWithCap(response, url, this.config.maxContentBytes);
        if (!bodyResult.ok) return null;
        return this.extractContent(finalUrl, bodyResult.html);
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      logger.warn('scraper_exception', {
        url,
        error: errorMessage(err),
      });
      return null;
    }
  }

  private extractContent(url: string, html: string): ScrapedPage | null {
    const { document } = parseHTML(html);
    const clone = document.cloneNode(true);
    const reader = new Readability(clone);
    const article = reader.parse();

    if (!article?.textContent) {
      const { document: fallbackDoc } = parseHTML(html);
      for (const el of fallbackDoc.querySelectorAll('script, style, nav, footer, header')) {
        el.remove();
      }
      const text = (fallbackDoc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return null;

      const truncated = text.slice(0, this.config.maxContentBytes);
      const title = nonEmpty(fallbackDoc.querySelector('title')?.textContent?.trim()) ?? url;
      return {
        url,
        title,
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
      title: nonEmpty(article.title) ?? url,
      textContent,
      contentHash: createHash('sha256').update(textContent).digest('hex').slice(0, 16),
    };
  }
}
