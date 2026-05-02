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
} from '@modules/auth/adapters/secondary/nonce-store';

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
