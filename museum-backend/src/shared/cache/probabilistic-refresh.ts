import { errorMessage } from '@shared/errors/error-message';
import { randomSource } from '@shared/utils/random';

import type { CacheService } from '@shared/cache/cache.port';

export const EARLY_REFRESH_THRESHOLD_DEFAULT = 0.9;

export const OUTAGE_CACHE_TTL_SECONDS = 60;

export interface RefreshableEntry<T> {
  value: T;
  storedAtMs: number;
  ttlSeconds: number;
}

export function shouldEarlyRefresh<T>(
  entry: RefreshableEntry<T>,
  nowMs: number,
  threshold: number = EARLY_REFRESH_THRESHOLD_DEFAULT,
): boolean {
  const ttlMs = entry.ttlSeconds * 1_000;
  if (ttlMs <= 0) return false;
  const elapsedRatio = (nowMs - entry.storedAtMs) / ttlMs;
  if (elapsedRatio < threshold) return false;
  return randomSource.unit() < (elapsedRatio - threshold) / (1 - threshold);
}

export interface RefreshLogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

export interface BackgroundRefreshDeps<T> {
  cache: CacheService;
  logger: RefreshLogger;
  opName: string;
  failureMessage: string;
  isEmpty: (value: T) => boolean;
}

export interface BackgroundRefreshTriggerArgs<T> {
  cacheKey: string;
  refresh: () => Promise<T>;
  positiveTtlSeconds: number;
  negativeTtlSeconds: number;
}

export function createBackgroundRefresh<T>(deps: BackgroundRefreshDeps<T>) {
  return function trigger(args: BackgroundRefreshTriggerArgs<T>): void {
    const { cacheKey, refresh, positiveTtlSeconds, negativeTtlSeconds } = args;
    void (async () => {
      try {
        const value = await refresh();
        const ttlSeconds = deps.isEmpty(value) ? negativeTtlSeconds : positiveTtlSeconds;
        const entry: RefreshableEntry<T> = {
          value,
          storedAtMs: Date.now(),
          ttlSeconds,
        };
        await deps.cache.set(cacheKey, entry, ttlSeconds);
      } catch (error) {
        deps.logger.warn(deps.failureMessage, {
          op: deps.opName,
          cacheKey,
          error: errorMessage(error),
        });
      }
    })();
  };
}
