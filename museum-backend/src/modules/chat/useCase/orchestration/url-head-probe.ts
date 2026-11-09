import { createHash } from 'node:crypto';

import { logger } from '@shared/logger/logger';

import type { CacheService } from '@shared/cache/cache.port';

export interface UrlProbeResult {
  reachable: boolean;
  statusCode?: number;
  cached: boolean;
}

export interface ProbeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface UrlHeadProbeDeps {
  cache: CacheService;
  fetchFn?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 800;
const CACHE_TTL_SECONDS = 3600;
const CACHE_KEY_PREFIX = 'head-probe:v1:';
const USER_AGENT = 'Musaium-CitationProbe/1.0 (+https://musaium.com)';
const SHA_PREFIX_LEN = 16;

function cacheKeyFor(url: string): string {
  const sha = createHash('sha256').update(url).digest('hex').slice(0, SHA_PREFIX_LEN);
  return `${CACHE_KEY_PREFIX}${sha}`;
}

interface CachedProbeRecord {
  reachable: boolean;
  statusCode?: number;
}

export class UrlHeadProbe {
  private readonly cache: CacheService;
  private readonly fetchFn: typeof fetch;

  constructor(deps: UrlHeadProbeDeps) {
    this.cache = deps.cache;
    this.fetchFn = deps.fetchFn ?? fetch;
  }

  async probeBatch(urls: string[], opts: ProbeOptions = {}): Promise<Map<string, UrlProbeResult>> {
    const out = new Map<string, UrlProbeResult>();
    if (urls.length === 0) return out;

    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const parentSignal = opts.signal;

    await Promise.all(
      urls.map(async (url) => {
        const result = await this.probeOne(url, timeoutMs, parentSignal);
        out.set(url, result);
      }),
    );

    return out;
  }

  private async probeOne(
    url: string,
    timeoutMs: number,
    parentSignal: AbortSignal | undefined,
  ): Promise<UrlProbeResult> {
    const key = cacheKeyFor(url);

    const cached = await this.cache.get<CachedProbeRecord>(key);
    if (cached !== null) {
      return { reachable: cached.reachable, statusCode: cached.statusCode, cached: true };
    }

    const headResult = await this.fetchWithBudget(url, 'HEAD', timeoutMs, parentSignal);

    let final = headResult;
    if (headResult.statusCode === 405) {
      final = await this.fetchWithBudget(url, 'GET', timeoutMs, parentSignal, {
        Range: 'bytes=0-0',
      });
    }

    const toStore: CachedProbeRecord = { reachable: final.reachable };
    if (final.statusCode !== undefined) toStore.statusCode = final.statusCode;
    await this.cache.set(key, toStore, CACHE_TTL_SECONDS);

    const result: UrlProbeResult = { reachable: final.reachable, cached: false };
    if (final.statusCode !== undefined) result.statusCode = final.statusCode;
    return result;
  }

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

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
