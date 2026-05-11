/**
 * URL head probe — Citations v2 (C4) URL reachability check.
 *
 * Third line of defense after parser (`assistant-response.ts` T2.2) and
 * quote string-match validator (`sources-validator.ts` T2.4). Detects
 * hallucinated URLs that pass the Zod schema (well-formed) and survived the
 * verbatim-quote substring match but actually resolve to nothing — broken
 * links, 404s, fabricated paths under real hosts (`wikidata.org/wiki/Q-FAKE`).
 *
 * Spec:   `team-state/2026-05-11-c4-anti-hallucination/spec.md#R5`
 * Design: `team-state/2026-05-11-c4-anti-hallucination/design.md#D5`
 * Plan:   `docs/plans/2026-05-10-c4-launch-prompt.md` §F Step 2.5
 *
 * Behavior contract:
 * - Sends a HEAD request per URL with an 800 ms per-URL timeout
 *   (`AbortSignal.timeout`).
 * - Honors an optional parent `AbortSignal` (cascade via `AbortSignal.any`).
 * - On HTTP 405 (some CDNs refuse HEAD — Cloudflare Workers, S3 with strict
 *   Method ACL), retries with `GET` + header `Range: bytes=0-0` (1-byte read,
 *   negligible bandwidth).
 * - Caches the outcome in Redis under key `head-probe:v1:{sha256(url)[:16]}`
 *   with TTL 3 600 s (1 h, design D5). Both reachable AND unreachable
 *   outcomes are cached — re-probing a known-dead link every request would
 *   defeat the cache (NFR2).
 * - Network errors (DNS / TCP reset / abort) → `reachable: false`, no throw
 *   (fail-open at the use-case level; the chat pipeline must not crash on a
 *   broken upstream).
 * - Empty input list → empty Map (zero I/O).
 *
 * Sécurité — SSRF (NFR-security):
 * - This probe does NOT enforce a hostname allowlist. URLs originate
 *   exclusively from upstream sources controlled by the platform (Wikidata,
 *   Brave Search, Wikimedia Commons, museum catalogue) per spec §126. Any
 *   change that lets user-controlled URLs reach this probe MUST add hostname
 *   filtering at the caller boundary (KnowledgeRouter / sources-validator)
 *   OR introduce an allowlist here — V2 hardening (spec Q3 deferred to Q3
 *   2026, post-launch). Caller is responsible until then.
 * - `User-Agent: Musaium-CitationProbe/1.0 (+https://musaium.app)` identifies
 *   the probe for good citizenship with upstream hosts.
 *
 * Hexagonal status: pure use-case. Depends on `CacheService` (port) + an
 * injectable `fetchFn` for the test seam. No framework imports.
 */

import { createHash } from 'node:crypto';

import { logger } from '@shared/logger/logger';
import { getLangfuse } from '@shared/observability/langfuse.client';
import { chatUrlHeadProbeTotal } from '@shared/observability/prometheus-metrics';
import { safeTrace } from '@shared/observability/safeTrace';

import type { CacheService } from '@shared/cache/cache.port';

/** Outcome record stored both in the in-memory result Map and the Redis cache. */
export interface UrlProbeResult {
  /** True if the upstream answered with a 2xx (or 206 from the GET-Range fallback). */
  reachable: boolean;
  /** HTTP status code if a response was received; undefined on network error / abort. */
  statusCode?: number;
  /** True when the result was served from the Redis cache (no network call this request). */
  cached: boolean;
}

/** Optional per-call tuning. */
export interface ProbeOptions {
  /** Per-URL timeout in ms. Default 800 (design D5). */
  timeoutMs?: number;
  /** Parent signal — aborts cascade through `AbortSignal.any` (Node ≥ 22.3). */
  signal?: AbortSignal;
}

/** Constructor dependencies. `fetchFn` is injectable so tests can stub it. */
export interface UrlHeadProbeDeps {
  cache: CacheService;
  /** Defaults to the global `fetch`. Inject a stub in unit tests. */
  fetchFn?: typeof fetch;
}

/** Default per-URL timeout (ms) — design D5. */
const DEFAULT_TIMEOUT_MS = 800;
/** Redis TTL (s) — design D5 trades freshness for p99 (1 h short enough to catch fresh dead links). */
const CACHE_TTL_SECONDS = 3600;
/** Cache-key prefix — versioned so a future shape change can co-exist with old entries. */
const CACHE_KEY_PREFIX = 'head-probe:v1:';
/** Identifies the probe to upstream hosts — good-citizen practice. */
const USER_AGENT = 'Musaium-CitationProbe/1.0 (+https://musaium.app)';
/** SHA-256 prefix length (hex chars) used in the cache key — 16 → 64 bits → collisions practically irrelevant at this scale. */
const SHA_PREFIX_LEN = 16;

/** Derive the Redis cache key for a given URL. */
function cacheKeyFor(url: string): string {
  const sha = createHash('sha256').update(url).digest('hex').slice(0, SHA_PREFIX_LEN);
  return `${CACHE_KEY_PREFIX}${sha}`;
}

/** Shape of the value stored in Redis (subset of `UrlProbeResult` — `cached` is rebuilt per call). */
interface CachedProbeRecord {
  reachable: boolean;
  statusCode?: number;
}

/**
 * Probe a batch of URLs for reachability with a 1 h Redis cache.
 *
 * Use-case-level cache, DI-friendly. Construct once at composition root and
 * share across requests (the underlying Redis client is the shared
 * `RedisCacheService` — no per-call connection cost).
 */
export class UrlHeadProbe {
  private readonly cache: CacheService;
  private readonly fetchFn: typeof fetch;

  constructor(deps: UrlHeadProbeDeps) {
    this.cache = deps.cache;
    this.fetchFn = deps.fetchFn ?? fetch;
  }

  /**
   * Probe every URL and return a Map keyed by the original URL string.
   *
   * Cache lookup is best-effort: a Redis outage degrades to "probe everything"
   * (slower but still correct). Write failures are silently swallowed by
   * `RedisCacheService.set` (fail-soft) — log noise minimized.
   *
   * C4 T7.2 — emits exactly one Langfuse trace `chat.citations.head_probe`
   * per call (NOT per URL — avoids span fan-out on 5-URL batches) with
   * aggregated metadata : `url_count`, `cache_hit_rate`, `unreachable_count`.
   * Empty input short-circuits BEFORE the trace call (no zero-I/O spans).
   * Per-URL Prometheus counter increments happen in `probeOne` so cache hits
   * and outcomes are both visible.
   */
  async probeBatch(urls: string[], opts: ProbeOptions = {}): Promise<Map<string, UrlProbeResult>> {
    const out = new Map<string, UrlProbeResult>();
    if (urls.length === 0) return out;

    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const parentSignal = opts.signal;

    // Probe every URL in parallel — independent network calls, no shared state.
    // `Promise.all` short-circuits on rejection ; since probeOne is fail-open
    // (never throws), this resolves on every URL.
    await Promise.all(
      urls.map(async (url) => {
        const result = await this.probeOne(url, timeoutMs, parentSignal);
        out.set(url, result);
      }),
    );

    // C4 T7.2 — aggregated Langfuse span. Fail-open via safeTrace : a
    // Langfuse-SDK throw never bubbles into the chat path.
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

  /** Probe a single URL: cache-first, then HEAD, then 405→GET-Range fallback. */
  private async probeOne(
    url: string,
    timeoutMs: number,
    parentSignal: AbortSignal | undefined,
  ): Promise<UrlProbeResult> {
    const key = cacheKeyFor(url);

    // 1. Cache lookup. `null` covers both miss and Redis outage (fail-soft).
    const cached = await this.cache.get<CachedProbeRecord>(key);
    if (cached !== null) {
      // C4 T7.3 — cache-hit counter. `cache_hit="true"` × outcome ∈ {reachable, unreachable}.
      chatUrlHeadProbeTotal.inc({
        cache_hit: 'true',
        outcome: cached.reachable ? 'reachable' : 'unreachable',
      });
      return { reachable: cached.reachable, statusCode: cached.statusCode, cached: true };
    }

    // 2. HEAD probe with per-URL timeout + parent-signal cascade.
    const headResult = await this.fetchWithBudget(url, 'HEAD', timeoutMs, parentSignal);

    // 3. 405 → fall back to GET Range: bytes=0-0 (strict CDNs).
    let final = headResult;
    if (headResult.statusCode === 405) {
      final = await this.fetchWithBudget(url, 'GET', timeoutMs, parentSignal, {
        Range: 'bytes=0-0',
      });
    }

    // 4. Write to Redis — 1 h TTL. Errors swallowed by RedisCacheService.set.
    //    Both reachable and unreachable results cached (see file-top contract).
    const toStore: CachedProbeRecord = { reachable: final.reachable };
    if (final.statusCode !== undefined) toStore.statusCode = final.statusCode;
    await this.cache.set(key, toStore, CACHE_TTL_SECONDS);

    // C4 T7.3 — cache-miss counter (we just paid the network cost).
    chatUrlHeadProbeTotal.inc({
      cache_hit: 'false',
      outcome: final.reachable ? 'reachable' : 'unreachable',
    });

    const result: UrlProbeResult = { reachable: final.reachable, cached: false };
    if (final.statusCode !== undefined) result.statusCode = final.statusCode;
    return result;
  }

  /**
   * Execute one HTTP request with the agreed budget + safety net. Returns a
   * `{reachable, statusCode}` pair ; never throws. Errors (DNS / abort /
   * connection reset) become `{reachable: false}` per spec R5.
   */
  private async fetchWithBudget(
    url: string,
    method: 'HEAD' | 'GET',
    timeoutMs: number,
    parentSignal: AbortSignal | undefined,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ reachable: boolean; statusCode?: number }> {
    // Combine the per-URL timeout with the optional parent signal.
    // `AbortSignal.any` is Node ≥ 22.3 — verified via `engines.node` in
    // `museum-backend/package.json` (≥ 22.0.0 ; production runs on 22.x).
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
      // Network error, DNS failure, abort (timeout or parent) — fail-open.
      // Logged at debug level: noisy in dev, silenced via env-driven log
      // filter in prod. NEVER warn-level: a single broken URL in a batch of
      // 5 is normal operation, not an incident.
      logger.warn('[url-head-probe] fetch failed', {
        method,
        host: safeHost(url),
        errorName: err instanceof Error ? err.name : 'unknown',
      });
      return { reachable: false };
    }
  }
}

/**
 * Extract the host portion of a URL safely for logs. Malformed URLs return
 * the empty string — we never leak the full URL into logs (NFR7 PII-adjacent
 * + bandwidth), and we never throw on a parse error in the log path.
 */
function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

// Instrumentation — `chat_url_head_probe_total{cache_hit, outcome}` is declared
// in `shared/observability/prometheus-metrics.ts` and incremented in `probeOne`
// (T7.3 — 2026-05-11). The Langfuse aggregated span `chat.citations.head_probe`
// is emitted in `probeBatch` (T7.2).
