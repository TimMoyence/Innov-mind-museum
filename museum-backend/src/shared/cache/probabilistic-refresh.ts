/**
 * Shared probabilistic-refresh helper — PR-10 (UFR-022 green phase).
 *
 * Centralises the TTL-jitter algorithm previously duplicated in
 * `@shared/http/overpass-cache.ts` and `@shared/http/nominatim.client.ts`.
 *
 * Two exports:
 *   - `shouldEarlyRefresh(entry, nowMs, threshold?)` — pure predicate that
 *     smooths thundering-herd at TTL expiry. Returns `true` opportunistically
 *     in the last `(1 - threshold)` window via a `Math.random()` roll whose
 *     probability climbs linearly from 0 at the threshold to 1 at full TTL.
 *   - `createBackgroundRefresh(deps)` — factory returning a fire-and-forget
 *     trigger that re-fetches the source-of-truth, picks positive/negative TTL
 *     via `deps.isEmpty(value)`, and persists the new entry. Failures are
 *     swallowed and logged via `deps.logger.warn(message, context)`.
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-10-probabilistic-refresh/spec.md §4 (R1, R5)
 *   .claude/skills/team/team-state/2026-05-23-pr-10-probabilistic-refresh/design.md §1.2 (signatures)
 */
import type { CacheService } from '@shared/cache/cache.port';

/**
 * Default threshold for probabilistic early refresh. Once `elapsedRatio`
 * crosses 0.9, the helper rolls `Math.random()` against a linearly increasing
 * adjustment so the late-window callers serve cached value AND opportunistically
 * refresh in background. Exposed for callers that want to reason about the
 * window without reaching into the helper internals.
 */
export const EARLY_REFRESH_THRESHOLD_DEFAULT = 0.9;

/**
 * Minimal cache-entry shape the helper operates on. Generic over the payload
 * type so callers can union with `null` for sentinel-cached negatives without
 * a runtime guard (e.g. Nominatim's `NominatimReverseResult | null`).
 */
export interface RefreshableEntry<T> {
  value: T;
  storedAtMs: number;
  ttlSeconds: number;
}

/**
 * Returns `true` when the entry has crossed `threshold` of its TTL AND a
 * `Math.random()` roll falls below the linearly-scaled adjustment. The roll
 * is intentionally NON-cryptographic — this is TTL jitter, not a security
 * primitive.
 *
 * Edge cases:
 *   - `ttlSeconds <= 0` (including clock-skew negative) → false, no roll.
 *   - `elapsedRatio < threshold` → false, no roll (short-circuit).
 *
 * @param entry The cache entry under inspection.
 * @param nowMs Current wall-clock ms (injected for determinism in tests).
 * @param threshold Optional override of `EARLY_REFRESH_THRESHOLD_DEFAULT`.
 */
export function shouldEarlyRefresh<T>(
  entry: RefreshableEntry<T>,
  nowMs: number,
  threshold: number = EARLY_REFRESH_THRESHOLD_DEFAULT,
): boolean {
  const ttlMs = entry.ttlSeconds * 1_000;
  if (ttlMs <= 0) return false;
  const elapsedRatio = (nowMs - entry.storedAtMs) / ttlMs;
  if (elapsedRatio < threshold) return false;
  // eslint-disable-next-line sonarjs/pseudo-random -- non-security: TTL jitter
  return Math.random() < (elapsedRatio - threshold) / (1 - threshold);
}

/**
 * Logger contract the helper needs. Narrow on purpose — accepts the project's
 * `@shared/logger/logger` shape without dragging the whole module's typing.
 */
export interface RefreshLogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

/**
 * Dependencies bound at factory time (cache + logger + observability labels +
 * empty-payload predicate). One factory call yields one trigger function whose
 * `opName` / `failureMessage` are baked in.
 */
export interface BackgroundRefreshDeps<T> {
  /** Cache port used to persist the freshly fetched entry. */
  cache: CacheService;
  /** Logger used to emit a warning when refresh or cache.set fail. */
  logger: RefreshLogger;
  /** Dashboard-friendly operation label (e.g. `overpass.background-refresh`). */
  opName: string;
  /** Message passed as the first argument of `logger.warn(...)` on failure. */
  failureMessage: string;
  /**
   * Predicate that selects the negative-TTL bucket. Receives the freshly
   * fetched value (post-refresh). Returning `true` picks `negativeTtlSeconds`.
   */
  isEmpty: (value: T) => boolean;
}

/** Per-call arguments. Allows different cache keys / TTLs per trigger. */
export interface BackgroundRefreshTriggerArgs<T> {
  cacheKey: string;
  refresh: () => Promise<T>;
  positiveTtlSeconds: number;
  negativeTtlSeconds: number;
}

/**
 * Factory returning a fire-and-forget trigger. The returned function is
 * synchronous (`void`) — callers must NOT await it. Internally it spawns a
 * void IIFE that:
 *   1. invokes `refresh()`,
 *   2. selects TTL via `isEmpty(value)`,
 *   3. persists the entry via `cache.set(key, entry, ttl)`,
 *   4. on any thrown error, logs via `logger.warn(failureMessage, {op, cacheKey, error})`.
 *
 * Non-Error rejection values are stringified via `String(error)` so the log
 * context stays homogeneous (downstream dashboards rely on `error: string`).
 *
 * @param deps Factory-bound dependencies (cache, logger, labels, isEmpty).
 */
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
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  };
}
