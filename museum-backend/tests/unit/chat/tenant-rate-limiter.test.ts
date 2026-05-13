/**
 * 2026-05-13 — Per-tenant rate limiter tests (perennial design §11 D10 / RE3).
 *
 * Validates the token-bucket primitive: burst capacity, refill rate,
 * per-tenant isolation, reset semantics, defensive input handling, and the
 * `onReject` observability callback.
 *
 * The breaker reads `now()` through the injected seam — no Jest fake timers
 * needed. Each test cursor is independent so concurrent describe blocks
 * cannot leak state.
 */
import { TenantRateLimiter } from '@modules/chat/adapters/secondary/guardrails/tenant-rate-limiter';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/**
 * Helper that returns a limiter bound to a controlled clock. Capacity / refill
 * defaults are deliberately small so tests run fast.
 * @param overrides
 */
function makeLimiter(overrides: Partial<ConstructorParameters<typeof TenantRateLimiter>[0]> = {}): {
  limiter: TenantRateLimiter;
  tick: (deltaMs: number) => void;
} {
  let cursor = new Date('2026-05-13T10:00:00Z').getTime();
  const limiter = new TenantRateLimiter({
    capacity: 3,
    refillPerSecond: 1,
    now: () => cursor,
    ...overrides,
  });
  return {
    limiter,
    tick: (deltaMs: number) => {
      cursor += deltaMs;
    },
  };
}

describe('TenantRateLimiter — initial bucket', () => {
  it('starts full (allows `capacity` requests in a burst)', () => {
    const { limiter } = makeLimiter();
    expect(limiter.acquire('museum-1').allowed).toBe(true);
    expect(limiter.acquire('museum-1').allowed).toBe(true);
    expect(limiter.acquire('museum-1').allowed).toBe(true);
  });

  it('rejects the next acquire when bucket empty + provides retryAfterMs', () => {
    const { limiter } = makeLimiter();
    limiter.acquire('museum-1');
    limiter.acquire('museum-1');
    limiter.acquire('museum-1');
    const result = limiter.acquire('museum-1');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    // refillPerSecond=1 ⇒ ~1000 ms until next token
    expect(result.retryAfterMs).toBeLessThanOrEqual(1_000);
  });
});

describe('TenantRateLimiter — refill', () => {
  it('replenishes one token per second (default refillPerSecond=1)', () => {
    const { limiter, tick } = makeLimiter();
    limiter.acquire('museum-1');
    limiter.acquire('museum-1');
    limiter.acquire('museum-1');
    expect(limiter.acquire('museum-1').allowed).toBe(false);

    tick(1_000); // 1s elapsed ⇒ +1 token
    expect(limiter.acquire('museum-1').allowed).toBe(true);
    expect(limiter.acquire('museum-1').allowed).toBe(false);
  });

  it('refills proportionally (faster refill rate restores tokens sooner)', () => {
    const { limiter, tick } = makeLimiter({ capacity: 2, refillPerSecond: 5 });
    limiter.acquire('museum-1');
    limiter.acquire('museum-1');
    expect(limiter.acquire('museum-1').allowed).toBe(false);

    tick(200); // 200 ms × 5 tokens/s = 1 token regenerated
    expect(limiter.acquire('museum-1').allowed).toBe(true);
  });

  it('caps refill at the configured capacity (no infinite credit accumulation)', () => {
    const { limiter, tick } = makeLimiter();
    limiter.acquire('museum-1');
    limiter.acquire('museum-1');
    tick(60_000); // far more time than needed to refill — should cap at 3
    const inspect = limiter.inspect('museum-1');
    expect(inspect?.tokens).toBe(3);
  });
});

describe('TenantRateLimiter — per-tenant isolation', () => {
  it('different tenantIds maintain independent buckets', () => {
    const { limiter } = makeLimiter();
    // Drain tenant A
    limiter.acquire('museum-A');
    limiter.acquire('museum-A');
    limiter.acquire('museum-A');
    expect(limiter.acquire('museum-A').allowed).toBe(false);

    // Tenant B still has a full bucket
    expect(limiter.acquire('museum-B').allowed).toBe(true);
    expect(limiter.acquire('museum-B').allowed).toBe(true);
    expect(limiter.acquire('museum-B').allowed).toBe(true);
    expect(limiter.acquire('museum-B').allowed).toBe(false);
  });
});

describe('TenantRateLimiter — reset', () => {
  it('reset(tenantId) clears only that tenant', () => {
    const { limiter } = makeLimiter();
    limiter.acquire('museum-A');
    limiter.acquire('museum-A');
    limiter.acquire('museum-A');
    limiter.acquire('museum-B');

    limiter.reset('museum-A');

    // After reset, museum-A starts fresh (full bucket)
    expect(limiter.acquire('museum-A').allowed).toBe(true);
    // museum-B still has 2 tokens left (1 consumed)
    expect(limiter.acquire('museum-B').allowed).toBe(true);
    expect(limiter.acquire('museum-B').allowed).toBe(true);
    expect(limiter.acquire('museum-B').allowed).toBe(false);
  });

  it('reset() (no args) clears every bucket', () => {
    const { limiter } = makeLimiter();
    limiter.acquire('museum-A');
    limiter.acquire('museum-B');
    limiter.reset();
    expect(limiter.inspect('museum-A')).toBeNull();
    expect(limiter.inspect('museum-B')).toBeNull();
  });
});

describe('TenantRateLimiter — observability + defense', () => {
  it('calls onReject for each rejection (powers Prometheus counter)', () => {
    const rejects: string[] = [];
    const { limiter } = makeLimiter({ onReject: (id) => rejects.push(id) });
    limiter.acquire('museum-A');
    limiter.acquire('museum-A');
    limiter.acquire('museum-A');
    expect(limiter.acquire('museum-A').allowed).toBe(false);
    expect(limiter.acquire('museum-A').allowed).toBe(false);
    expect(rejects).toEqual(['museum-A', 'museum-A']);
  });

  it('rejects an empty / non-string tenantId defensively', () => {
    const { limiter } = makeLimiter();
    expect(limiter.acquire('').allowed).toBe(false);
    // @ts-expect-error — intentional misuse to assert defensive guard
    expect(limiter.acquire(null).allowed).toBe(false);
    // @ts-expect-error — intentional misuse to assert defensive guard
    expect(limiter.acquire(undefined).allowed).toBe(false);
  });

  it('throws at construction time on invalid capacity / refill', () => {
    expect(() => new TenantRateLimiter({ capacity: 0, refillPerSecond: 1 })).toThrow();
    expect(() => new TenantRateLimiter({ capacity: -1, refillPerSecond: 1 })).toThrow();
    expect(() => new TenantRateLimiter({ capacity: 5, refillPerSecond: 0 })).toThrow();
    expect(() => new TenantRateLimiter({ capacity: 5, refillPerSecond: Number.NaN })).toThrow();
  });

  it('inspect() returns null for an unseen tenant', () => {
    const { limiter } = makeLimiter();
    expect(limiter.inspect('never-seen')).toBeNull();
  });

  it('inspect() does NOT mutate bucket state', () => {
    const { limiter, tick } = makeLimiter();
    limiter.acquire('museum-A'); // 2 left
    tick(500);
    const first = limiter.inspect('museum-A');
    const second = limiter.inspect('museum-A');
    expect(first?.tokens).toBeCloseTo(second?.tokens ?? Number.NaN, 5);
  });
});
