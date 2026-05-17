/**
 * Per-tenant token-bucket (design §11 D10 RE3). V1: primitive only, NOT wired.
 * Mounted Phase 2 (B2B onset) — `acquire` surface stable for Phase 3 Redis swap.
 * Classic token-bucket (not leaky) — bursts to `capacity` allowed in one shot.
 */

import { logger } from '@shared/logger/logger';

export interface AcquireResult {
  allowed: boolean;
  /** allowed=false → ms until ONE more token regenerates. */
  retryAfterMs?: number;
}

interface TokenBucket {
  /** Float — refill fractional per ms. */
  tokens: number;
  /** ms epoch. */
  lastRefillAt: number;
}

export interface TenantRateLimiterOptions {
  capacity: number;
  /** 1.0 = 1 rps sustained. */
  refillPerSecond: number;
  now?: () => number;
  /** Wired by composition root for Prometheus; primitive stays metrics-free. */
  onReject?: (tenantId: string) => void;
}

/**
 * @example
 *   const limiter = new TenantRateLimiter({ capacity: 60, refillPerSecond: 1 });
 *   const { allowed, retryAfterMs } = limiter.acquire('museum-42');
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

  /** Lazy bucket creation + refill (no timers). */
  acquire(tenantId: string): AcquireResult {
    if (typeof tenantId !== 'string' || tenantId.length === 0) {
      // Defensive — reject rather than create unbounded bucket under empty key.
      return { allowed: false, retryAfterMs: 1_000 };
    }

    const bucket = this.refill(tenantId);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true };
    }
    const deficit = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil((deficit / this.refillPerSecond) * 1_000);
    this.onReject?.(tenantId);
    return { allowed: false, retryAfterMs };
  }

  /** Without tenantId clears ALL buckets (tests / emergency flush). */
  reset(tenantId?: string): void {
    if (tenantId === undefined) {
      const count = this.buckets.size;
      this.buckets.clear();
      logger.info('tenant_rate_limiter_reset_all', { bucketsCleared: count });
      return;
    }
    this.buckets.delete(tenantId);
  }

  /** Non-mutating — does not affect subsequent acquire() calls. */
  inspect(tenantId: string): { tokens: number; capacity: number } | null {
    const bucket = this.buckets.get(tenantId);
    if (!bucket) return null;
    const elapsedMs = Math.max(0, this.now() - bucket.lastRefillAt);
    const refill = (elapsedMs / 1_000) * this.refillPerSecond;
    const tokens = Math.min(this.capacity, bucket.tokens + refill);
    return { tokens, capacity: this.capacity };
  }

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
