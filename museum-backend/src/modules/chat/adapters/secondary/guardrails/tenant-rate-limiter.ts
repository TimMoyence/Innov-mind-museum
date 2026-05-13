/**
 * Per-tenant token-bucket rate limiter (perennial design §11 D10 — RE3).
 *
 * V1 status: **primitive only, NOT wired** into the chat pipeline. Mounted
 * Phase 2 (B2B onset) once the multi-tenant routing lands. Today every
 * museum tenant shares the global rate-limit middleware in `api.router.ts`;
 * this class lets us swap to per-tenant fair-share without a refactor.
 *
 * Storage is in-process (single Map). Acceptable for Phase 2 single-instance.
 * Phase 3 horizontal scale promotes to Redis (token-bucket Lua script);
 * the {@link acquire} surface stays unchanged so callers do not budge.
 *
 * Cardinality safety: the bucket Map is bounded by the number of distinct
 * tenant IDs. For Musaium Phase 2 (≤ ~20 B2B museums + 1 anonymous bucket)
 * this is a trivially small footprint. {@link reset} provides emergency
 * eviction if the operator suspects a runaway tenantId.
 *
 * Design choice: classic token-bucket (not leaky-bucket) — bursts up to
 * `capacity` are allowed in one shot, refill at `refillPerSecond` smoothly.
 * Matches the "school field trip 30 phones at once" scenario described in
 * design.md D10.
 */

import { logger } from '@shared/logger/logger';

/** Result of an `acquire` attempt. */
export interface AcquireResult {
  allowed: boolean;
  /** When `allowed=false`, the ms until enough tokens regenerate for ONE request. */
  retryAfterMs?: number;
}

/** Internal bucket state. */
interface TokenBucket {
  /** Current token count (float — refill is fractional per ms). */
  tokens: number;
  /** Timestamp (ms epoch) of the last refill computation. */
  lastRefillAt: number;
}

/** Constructor options. */
export interface TenantRateLimiterOptions {
  /** Max tokens a bucket can hold. Bursts up to this value pass through instantly. */
  capacity: number;
  /** Tokens regenerated per second. 1.0 = one request per second sustained. */
  refillPerSecond: number;
  /** Test seam — defaults to `Date.now()`. */
  now?: () => number;
  /**
   * Fired each time a bucket rejects a request. Used by the composition root
   * to wire Prometheus counters. The primitive itself stays metrics-free.
   */
  onReject?: (tenantId: string) => void;
}

/**
 * Token-bucket per-tenant rate limiter.
 *
 * Example:
 *   const limiter = new TenantRateLimiter({ capacity: 60, refillPerSecond: 1 });
 *   const { allowed, retryAfterMs } = limiter.acquire('museum-42');
 *   if (!allowed) return res.status(429).set('Retry-After', String(Math.ceil(retryAfterMs! / 1000))).end();
 */
export class TenantRateLimiter {
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly now: () => number;
  private readonly onReject?: (tenantId: string) => void;
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(options: TenantRateLimiterOptions) {
    if (!Number.isFinite(options.capacity) || options.capacity <= 0) {
      throw new Error('TenantRateLimiter: capacity must be a positive finite number');
    }
    if (!Number.isFinite(options.refillPerSecond) || options.refillPerSecond <= 0) {
      throw new Error('TenantRateLimiter: refillPerSecond must be a positive finite number');
    }
    this.capacity = options.capacity;
    this.refillPerSecond = options.refillPerSecond;
    this.now = options.now ?? Date.now;
    this.onReject = options.onReject;
  }

  /**
   * Attempts to consume one token from the tenant's bucket. Returns
   * `{ allowed: true }` if a token was available, or `{ allowed: false,
   * retryAfterMs }` if rejected (with the minimum wait before a single
   * token regenerates).
   *
   * The bucket is created on first access. Refill is computed lazily — no
   * background timers, no scheduler pressure.
   */
  acquire(tenantId: string): AcquireResult {
    if (typeof tenantId !== 'string' || tenantId.length === 0) {
      // Defensive — caller bug. Reject to fail-safe rather than create an
      // unbounded bucket under an empty key.
      return { allowed: false, retryAfterMs: 1_000 };
    }

    const bucket = this.refill(tenantId);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true };
    }
    // Compute exact ms until ONE more token becomes available.
    const deficit = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil((deficit / this.refillPerSecond) * 1_000);
    this.onReject?.(tenantId);
    return { allowed: false, retryAfterMs };
  }

  /**
   * Manually clears a single tenant's bucket (operator runbook tool: reset a
   * tenant after they explain a legitimate burst). Without `tenantId`, clears
   * EVERY bucket — useful for tests + emergency global flush.
   */
  reset(tenantId?: string): void {
    if (tenantId === undefined) {
      const count = this.buckets.size;
      this.buckets.clear();
      logger.info('tenant_rate_limiter_reset_all', { bucketsCleared: count });
      return;
    }
    this.buckets.delete(tenantId);
  }

  /**
   * Returns the current token count for a tenant (does not mutate). Useful
   * for diagnostics + tests asserting on bucket state.
   */
  inspect(tenantId: string): { tokens: number; capacity: number } | null {
    const bucket = this.buckets.get(tenantId);
    if (!bucket) return null;
    // Compute the up-to-date value without mutation (so callers can read
    // the live state without affecting subsequent `acquire` calls).
    const elapsedMs = Math.max(0, this.now() - bucket.lastRefillAt);
    const refill = (elapsedMs / 1_000) * this.refillPerSecond;
    const tokens = Math.min(this.capacity, bucket.tokens + refill);
    return { tokens, capacity: this.capacity };
  }

  /** Lazily creates + refills a tenant bucket, returning a mutable reference. */
  private refill(tenantId: string): TokenBucket {
    const now = this.now();
    let bucket = this.buckets.get(tenantId);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefillAt: now };
      this.buckets.set(tenantId, bucket);
      return bucket;
    }
    const elapsedMs = Math.max(0, now - bucket.lastRefillAt);
    if (elapsedMs > 0) {
      const refill = (elapsedMs / 1_000) * this.refillPerSecond;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + refill);
      bucket.lastRefillAt = now;
    }
    return bucket;
  }
}
