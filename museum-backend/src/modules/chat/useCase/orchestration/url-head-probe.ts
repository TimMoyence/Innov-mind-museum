/**
 * UrlHeadProbe — Citations v2 (C4) reachability check, third defense after
 * parser + quote validator. Detects hallucinated URLs that pass Zod + survive
 * verbatim-quote but resolve to nothing (broken links, 404s, fabricated paths).
 *
 * Contract:
 * - HEAD with 800ms timeout (design D5); honors parent `AbortSignal` via
 *   `AbortSignal.any` (Node ≥ 22.3, verified in package.json).
 * - On 405 (strict CDNs: Cloudflare Workers, S3) retries `GET` with
 *   `Range: bytes=0-0` (1-byte read).
 * - Caches both reachable AND unreachable outcomes in Redis 1h
 *   (`head-probe:v1:{sha256(url)[:16]}`); re-probing known-dead would defeat
 *   cache (NFR2).
 * - Network errors → `reachable: false`, NEVER throws (fail-open). Empty
 *   input → empty Map (zero I/O).
 *
 * SEC SSRF (NFR-security): NO hostname allowlist. URLs MUST originate
 * exclusively from platform-controlled sources (Wikidata, Brave, Wikimedia
 * Commons, museum catalog — spec §126). Any change letting user-controlled
 * URLs reach this probe MUST add hostname filtering at caller boundary OR
 * introduce allowlist here (V2 hardening, Q3 2026 post-launch). User-Agent
 * identifies probe for upstream good-citizenship.
 */

import { createHash } from 'node:crypto';

import { logger } from '@shared/logger/logger';
import { getLangfuse } from '@shared/observability/langfuse.client';
import { chatUrlHeadProbeTotal } from '@shared/observability/prometheus-metrics';
import { safeTrace } from '@shared/observability/safeTrace';

import type { CacheService } from '@shared/cache/cache.port';

export interface UrlProbeResult {
  /** True iff 2xx (or 206 from GET-Range fallback). */
  reachable: boolean;
  /** Undefined on network error / abort. */
  statusCode?: number;
  /** True when served from Redis (no network call). */
  cached: boolean;
}

export interface ProbeOptions {
  /** Default 800 (design D5). */
  timeoutMs?: number;
  /** Cascades via `AbortSignal.any`. */
  signal?: AbortSignal;
}

export interface UrlHeadProbeDeps {
  cache: CacheService;
  fetchFn?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 800;
const CACHE_TTL_SECONDS = 3600;
/** Bump on payload-shape changes. */
const CACHE_KEY_PREFIX = 'head-probe:v1:';
const USER_AGENT = 'Musaium-CitationProbe/1.0 (+https://musaium.com)';
/** 64-bit prefix — collisions practically irrelevant at this scale. */
const SHA_PREFIX_LEN = 16;

function cacheKeyFor(url: string): string {
  const sha = createHash('sha256').update(url).digest('hex').slice(0, SHA_PREFIX_LEN);
  return `${CACHE_KEY_PREFIX}${sha}`;
}

/** `cached` rebuilt per call → excluded from stored record. */
interface CachedProbeRecord {
  reachable: boolean;
  statusCode?: number;
}

/** Single instance per process — no per-request state. */
export class UrlHeadProbe {
  private readonly cache: CacheService;
  private readonly fetchFn: typeof fetch;

  constructor(deps: UrlHeadProbeDeps) {
    this.cache = deps.cache;
    this.fetchFn = deps.fetchFn ?? fetch;
  }

  /**
   * Best-effort cache (Redis outage → probe everything, still correct).
   * Emits ONE aggregated Langfuse trace per call (not per URL — avoids span
   * fan-out on 5-URL batches); per-URL Prom counter in `probeOne`.
   */
  async probeBatch(urls: string[], opts: ProbeOptions = {}): Promise<Map<string, UrlProbeResult>> {
    const out = new Map<string, UrlProbeResult>();
    if (urls.length === 0) return out;

    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const parentSignal = opts.signal;

    // Parallel — probeOne is fail-open so Promise.all resolves on every URL.
    await Promise.all(
      urls.map(async (url) => {
        const result = await this.probeOne(url, timeoutMs, parentSignal);
        out.set(url, result);
      }),
    );

    // Fail-open via safeTrace — Langfuse SDK throw never bubbles into chat path.
    const results = Array.from(out.values());
    const cacheHits = results.filter((r) => r.cached).length;
    const unreachable = results.filter((r) => !r.reachable).length;
    const lf = getLangfuse();
    safeTrace('chat.citations.head_probe.span', () => {
      lf?.trace({
        name: 'chat.citations.head_probe',
        metadata: {
          'head_probe.url_count': urls.length,
          'head_probe.cache_hit_rate': urls.length > 0 ? cacheHits / urls.length : 0,
          'head_probe.unreachable_count': unreachable,
        },
      });
    });

    return out;
  }

  /** Cache-first → HEAD → 405 fallback GET Range. */
  private async probeOne(
    url: string,
    timeoutMs: number,
    parentSignal: AbortSignal | undefined,
  ): Promise<UrlProbeResult> {
    const key = cacheKeyFor(url);

    // `null` covers both miss and Redis outage (fail-soft).
    const cached = await this.cache.get<CachedProbeRecord>(key);
    if (cached !== null) {
      chatUrlHeadProbeTotal.inc({
        cache_hit: 'true',
        outcome: cached.reachable ? 'reachable' : 'unreachable',
      });
      return { reachable: cached.reachable, statusCode: cached.statusCode, cached: true };
    }

    const headResult = await this.fetchWithBudget(url, 'HEAD', timeoutMs, parentSignal);

    // 405 → strict CDNs refuse HEAD; retry GET Range: bytes=0-0.
    let final = headResult;
    if (headResult.statusCode === 405) {
      final = await this.fetchWithBudget(url, 'GET', timeoutMs, parentSignal, {
        Range: 'bytes=0-0',
      });
    }

    // Cache both reachable and unreachable (file-top contract).
    const toStore: CachedProbeRecord = { reachable: final.reachable };
    if (final.statusCode !== undefined) toStore.statusCode = final.statusCode;
    await this.cache.set(key, toStore, CACHE_TTL_SECONDS);

    chatUrlHeadProbeTotal.inc({
      cache_hit: 'false',
      outcome: final.reachable ? 'reachable' : 'unreachable',
    });

    const result: UrlProbeResult = { reachable: final.reachable, cached: false };
    if (final.statusCode !== undefined) result.statusCode = final.statusCode;
    return result;
  }

  /** NEVER throws — errors (DNS/abort/reset) → `{reachable: false}` per R5. */
  private async fetchWithBudget(
    url: string,
    method: 'HEAD' | 'GET',
    timeoutMs: number,
    parentSignal: AbortSignal | undefined,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ reachable: boolean; statusCode?: number }> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal: AbortSignal = parentSignal
      ? AbortSignal.any([timeoutSignal, parentSignal])
      : timeoutSignal;

    try {
      const response = await this.fetchFn(url, {
        method,
        signal,
        headers: { 'User-Agent': USER_AGENT, ...extraHeaders },
      });
      return { reachable: response.ok, statusCode: response.status };
    } catch (err) {
      logger.warn('[url-head-probe] fetch failed', {
        method,
        host: safeHost(url),
        errorName: err instanceof Error ? err.name : 'unknown',
      });
      return { reachable: false };
    }
  }
}

/** NFR7 PII-adjacent — never leak full URL into logs; never throw on parse error. */
function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
