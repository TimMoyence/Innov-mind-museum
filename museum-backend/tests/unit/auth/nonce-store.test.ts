/**
 * F3 — OIDC nonce store unit tests.
 *
 * Covers the in-memory implementation that backs dev / tests when Redis is
 * unavailable, and asserts the single-use semantics that make stolen ID-token
 * replay impossible: once consumed, a nonce can never be redeemed again.
 */
import { InMemoryNonceStore } from '@modules/auth/adapters/secondary/nonce-store';

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
});
