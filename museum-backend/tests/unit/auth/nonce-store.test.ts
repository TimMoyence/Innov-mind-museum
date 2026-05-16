/**
 * F3 — OIDC nonce store unit tests.
 *
 * Covers the in-memory implementation that backs dev / tests when Redis is
 * unavailable, and asserts the single-use semantics that make stolen ID-token
 * replay impossible: once consumed, a nonce can never be redeemed again.
 *
 * Phase 8: extended to pin RedisNonceStore Redis-error fallback contract +
 * createNonceStore wiring branches.
 */
import {
  createNonceStore,
  InMemoryNonceStore,
  RedisNonceStore,
  setSocialNonceStore,
  socialNonceStore,
} from '@modules/auth/adapters/secondary/social/nonce-store';

import type Redis from 'ioredis';

describe('InMemoryNonceStore — F3 (OIDC nonce single-use)', () => {
  it('issue() returns a base64url string with at least 128 bits of entropy', async () => {
    const store = new InMemoryNonceStore();
    const nonce = await store.issue();
    // base64url of 16 bytes is 22 chars (no padding)
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    // Two consecutive calls must not collide.
    const nonce2 = await store.issue();
    expect(nonce2).not.toEqual(nonce);
  });

  it('consume() returns true on first redemption then false on replay', async () => {
    const store = new InMemoryNonceStore();
    const nonce = await store.issue();
    await expect(store.consume(nonce)).resolves.toBe(true);
    await expect(store.consume(nonce)).resolves.toBe(false);
  });

  it('consume() returns false for an unknown nonce', async () => {
    const store = new InMemoryNonceStore();
    await expect(store.consume('never-issued')).resolves.toBe(false);
  });

  it('consume() returns true within TTL with a frozen clock, then false on replay', async () => {
    const store = new InMemoryNonceStore({ ttlSeconds: 60, now: () => 0 });
    const nonce = await store.issue();
    expect(await store.consume(nonce)).toBe(true);
    expect(await store.consume(nonce)).toBe(false);
  });

  it('expired nonce is rejected even before any consume call', async () => {
    let nowMs = 1_000_000;
    const store = new InMemoryNonceStore({ ttlSeconds: 1, now: () => nowMs });
    const nonce = await store.issue();
    nowMs += 2_000; // advance past TTL
    await expect(store.consume(nonce)).resolves.toBe(false);
  });

  it('valid nonce inside TTL is consumed exactly once', async () => {
    let nowMs = 0;
    const store = new InMemoryNonceStore({ ttlSeconds: 60, now: () => nowMs });
    const nonce = await store.issue();
    nowMs += 30_000; // half TTL
    await expect(store.consume(nonce)).resolves.toBe(true);
    await expect(store.consume(nonce)).resolves.toBe(false);
  });

  it('clear() drops all entries (test helper contract)', async () => {
    const store = new InMemoryNonceStore();
    const nonce = await store.issue();
    store.clear();
    // After clear the previously-issued nonce is no longer redeemable.
    await expect(store.consume(nonce)).resolves.toBe(false);
  });

  // Stryker survivor #1 — EqualityOperator at L34 (`override > 0` → `>= 0`).
  // ttlSeconds=0 must NOT be honoured as a literal "0-second TTL"; it should
  // fall through to the env / 300s default. If the operator mutates to `>= 0`,
  // a freshly-issued nonce would be born already expired (expiresAt === now)
  // and consume() would return false — proving the mutant.
  it('issue() with ttlSeconds=0 falls back to env default rather than treating 0 as a valid TTL', async () => {
    const previous = process.env.SOCIAL_NONCE_TTL_SECONDS;
    delete process.env.SOCIAL_NONCE_TTL_SECONDS;
    try {
      let nowMs = 1_000;
      const store = new InMemoryNonceStore({ ttlSeconds: 0, now: () => nowMs });
      const nonce = await store.issue();
      // Within the 300s default the nonce must still be redeemable.
      nowMs += 60_000; // 60s — well inside the 300s default fallback window.
      await expect(store.consume(nonce)).resolves.toBe(true);
    } finally {
      if (previous === undefined) delete process.env.SOCIAL_NONCE_TTL_SECONDS;
      else process.env.SOCIAL_NONCE_TTL_SECONDS = previous;
    }
  });

  // Stryker survivor #2 — EqualityOperator at L77 (`expiresAt > now` → `>=`).
  // A nonce whose stored expiresAt EXACTLY equals the wall clock at consume
  // time is past its window (the TTL is a strict upper bound). The mutant
  // would accept it as still-valid.
  it('consume() rejects a nonce whose expiresAt equals the current clock (boundary)', async () => {
    let nowMs = 0;
    const store = new InMemoryNonceStore({ ttlSeconds: 60, now: () => nowMs });
    const nonce = await store.issue(); // expiresAt = 0 + 60_000 = 60_000
    nowMs = 60_000; // advance to the exact expiry instant
    await expect(store.consume(nonce)).resolves.toBe(false);
  });

  // Stryker survivor #3 — MethodRemoval at L37 (`Number.isFinite(parsed)`
  // dropped). With a non-numeric env value, parseInt returns NaN; without the
  // isFinite gate the mutant would propagate NaN and hand back NaN as TTL.
  // Default-300s fallback proves the gate is doing its job.
  it('resolveTtlSeconds falls back to 300s when env SOCIAL_NONCE_TTL_SECONDS is non-numeric', async () => {
    const previous = process.env.SOCIAL_NONCE_TTL_SECONDS;
    process.env.SOCIAL_NONCE_TTL_SECONDS = 'abc';
    try {
      let nowMs = 0;
      // No ttlSeconds override → resolveTtlSeconds reads the (garbage) env.
      const store = new InMemoryNonceStore({ now: () => nowMs });
      const nonce = await store.issue();
      // 299s in: still inside the 300s default — must be redeemable.
      nowMs = 299_000;
      await expect(store.consume(nonce)).resolves.toBe(true);

      const nonce2 = await store.issue();
      // 301s past issue → outside the 300s default — must be rejected.
      nowMs = 299_000 + 301_000;
      await expect(store.consume(nonce2)).resolves.toBe(false);
    } finally {
      if (previous === undefined) delete process.env.SOCIAL_NONCE_TTL_SECONDS;
      else process.env.SOCIAL_NONCE_TTL_SECONDS = previous;
    }
  });

  // Stryker survivor #4 — ArgumentChange at L30 (`randomBytes(NONCE_BYTES)`).
  // 16 bytes → exactly 22 base64url chars (no padding). A mutant that lowers
  // the byte count to 15 would produce 20 chars; a higher count would produce
  // ≥24. The existing `{22,}` regex is permissive — pin it to exactly 22.
  it('issue() returns a nonce of exactly 22 base64url chars (16 bytes, no padding)', async () => {
    const store = new InMemoryNonceStore();
    const nonce = await store.issue();
    expect(nonce).toHaveLength(22);
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});

/**
 * Build a stub Redis client that satisfies the surface area used by
 * RedisNonceStore (`set` + `getdel`). Each method delegates to the supplied
 * implementation so individual tests can model success / error / fallback.
 */
function stubRedis(impl: { set?: jest.Mock; getdel?: jest.Mock }): Redis {
  return {
    set: impl.set ?? jest.fn().mockResolvedValue('OK'),
    getdel: impl.getdel ?? jest.fn().mockResolvedValue(null),
  } as unknown as Redis;
}

describe('RedisNonceStore — F3 fallback semantics', () => {
  it('issue() forwards to fallback InMemoryNonceStore when redis.set throws', async () => {
    const set = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const store = new RedisNonceStore(stubRedis({ set }), { ttlSeconds: 60 });

    const nonce = await store.issue();

    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(set).toHaveBeenCalledTimes(1);
    // Fallback nonce is consumable through the same store.
    await expect(store.consume(nonce)).resolves.toBe(true);
  });

  it('consume() returns true when GETDEL returns a non-null value', async () => {
    const getdel = jest.fn().mockResolvedValue('1');
    const store = new RedisNonceStore(stubRedis({ getdel }));

    await expect(store.consume('abc')).resolves.toBe(true);
    expect(getdel).toHaveBeenCalledWith('oidc:nonce:abc');
  });

  it('consume() returns false when GETDEL returns null AND fallback has no entry', async () => {
    const getdel = jest.fn().mockResolvedValue(null);
    const store = new RedisNonceStore(stubRedis({ getdel }));

    await expect(store.consume('never-issued')).resolves.toBe(false);
  });

  it('consume() falls through to fallback when redis.getdel throws', async () => {
    const set = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const getdel = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const store = new RedisNonceStore(stubRedis({ set, getdel }));

    // Issue routes to in-memory fallback (Redis errored), then consume must
    // also fall through to the same in-memory store on Redis error.
    const nonce = await store.issue();
    await expect(store.consume(nonce)).resolves.toBe(true);
  });
});

describe('createNonceStore — composition root branch coverage', () => {
  it('returns InMemoryNonceStore when no Redis client is provided', () => {
    expect(createNonceStore()).toBeInstanceOf(InMemoryNonceStore);
  });

  it('returns RedisNonceStore when a Redis client is provided', () => {
    expect(createNonceStore(stubRedis({}))).toBeInstanceOf(RedisNonceStore);
  });
});

/**
 * T1.7#5 — socialNonceStore delegating singleton.
 *
 * The auth composition root captures a stable reference at module load (before
 * the shared Redis client exists); `src/index.ts` upgrades the inner adapter
 * via setSocialNonceStore once Redis is wired. The contract under test: the
 * exported reference stays the same identity but its behavior follows the
 * latest delegate.
 */
describe('socialNonceStore — delegating singleton swap', () => {
  afterEach(() => {
    // Reset to the in-memory default so other test files don't see drift.
    setSocialNonceStore(new InMemoryNonceStore());
  });

  it('defaults to in-memory behavior before any swap', async () => {
    const nonce = await socialNonceStore.issue();
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
    await expect(socialNonceStore.consume(nonce)).resolves.toBe(true);
    await expect(socialNonceStore.consume(nonce)).resolves.toBe(false);
  });

  it('routes issue/consume through the new delegate after setSocialNonceStore', async () => {
    const set = jest.fn().mockResolvedValue('OK');
    const getdel = jest.fn().mockResolvedValue('1');
    setSocialNonceStore(new RedisNonceStore(stubRedis({ set, getdel })));

    const nonce = await socialNonceStore.issue();
    expect(set).toHaveBeenCalledWith(
      expect.stringMatching(/^oidc:nonce:/),
      '1',
      'EX',
      expect.any(Number),
      'NX',
    );
    await expect(socialNonceStore.consume(nonce)).resolves.toBe(true);
    expect(getdel).toHaveBeenCalledWith(`oidc:nonce:${nonce}`);
  });
});
