/**
 * F11-mobile (2026-05) — One-time-code (OTC) store unit tests.
 *
 * Covers the in-memory implementation that backs the mobile OAuth redeem flow:
 * after the server-mediated /google/callback succeeds for a mobile platform
 * state, the resulting AuthSessionResponse is stashed under a fresh OTC, the
 * client receives the OTC via deeplink, and exchanges it once for the session
 * payload via POST /api/auth/social-redeem. Single-use semantics make a
 * leaked deeplink unredeemable past the first /redeem call.
 */
import { z } from 'zod';

import {
  createSocialOtcStore,
  InMemorySocialOtcStore,
  RedisSocialOtcStore,
} from '@modules/auth/adapters/secondary/social/social-otc-store';

import type Redis from 'ioredis';

interface FakeSession {
  accessToken: string;
  refreshToken: string;
  user: { id: number };
}

const fakeSessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({ id: z.number() }),
});

const fakeSession = (overrides: Partial<FakeSession> = {}): FakeSession => ({
  accessToken: 'access-tok',
  refreshToken: 'refresh-tok',
  user: { id: 42 },
  ...overrides,
});

describe('InMemorySocialOtcStore — F11-mobile single-use redeem', () => {
  it('issue() returns a base64url string with at least 128 bits of entropy', async () => {
    const store = new InMemorySocialOtcStore<FakeSession>();
    const code = await store.issue(fakeSession());
    // base64url of 16 bytes is 22 chars (no padding)
    expect(code).toMatch(/^[A-Za-z0-9_-]{22,}$/);

    // Two consecutive calls must not collide.
    const code2 = await store.issue(fakeSession());
    expect(code2).not.toEqual(code);
  });

  it('consume() returns the stored payload on first call then null on replay', async () => {
    const store = new InMemorySocialOtcStore<FakeSession>();
    const session = fakeSession({ accessToken: 'one-shot-only' });
    const code = await store.issue(session);
    await expect(store.consume(code)).resolves.toEqual(session);
    await expect(store.consume(code)).resolves.toBeNull();
  });

  it('consume() returns null for an unknown code', async () => {
    const store = new InMemorySocialOtcStore<FakeSession>();
    await expect(store.consume('never-issued-code')).resolves.toBeNull();
  });

  it('expired code is rejected even before any consume call', async () => {
    let nowMs = 1_000_000;
    const store = new InMemorySocialOtcStore<FakeSession>({
      ttlSeconds: 1,
      now: () => nowMs,
    });
    const code = await store.issue(fakeSession());
    nowMs += 2_000; // advance past TTL
    await expect(store.consume(code)).resolves.toBeNull();
  });

  it('valid code inside TTL is consumed exactly once', async () => {
    let nowMs = 0;
    const store = new InMemorySocialOtcStore<FakeSession>({
      ttlSeconds: 60,
      now: () => nowMs,
    });
    const session = fakeSession();
    const code = await store.issue(session);
    nowMs += 30_000; // half TTL
    await expect(store.consume(code)).resolves.toEqual(session);
    await expect(store.consume(code)).resolves.toBeNull();
  });

  it('createSocialOtcStore() falls back to the in-memory adapter when no Redis is provided', async () => {
    const store = createSocialOtcStore<FakeSession>({ schema: fakeSessionSchema });
    const session = fakeSession();
    const code = await store.issue(session);
    await expect(store.consume(code)).resolves.toEqual(session);
  });
});

describe('RedisSocialOtcStore — T1.7 Zod schema validation on consume', () => {
  /**
   * Fake Redis surface: a `Map<string, string>` plus the two methods the
   * adapter touches (`set`, `getdel`). Strictly enough to drive the
   * happy-path + poisoned-cache branches without an ioredis dependency.
   */
  function makeFakeRedis() {
    const store = new Map<string, string>();
    return {
      store,
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      getdel: jest.fn(async (key: string) => {
        const v = store.get(key) ?? null;
        store.delete(key);
        return v;
      }),
    } as unknown as Redis & {
      store: Map<string, string>;
      getdel: jest.Mock;
    };
  }

  it('consume() returns the parsed payload when the schema accepts the Redis blob', async () => {
    const redis = makeFakeRedis();
    const adapter = new RedisSocialOtcStore<FakeSession>(redis, {
      schema: fakeSessionSchema,
    });
    const session = fakeSession();
    const code = await adapter.issue(session);

    await expect(adapter.consume(code)).resolves.toEqual(session);
  });

  it('consume() falls through to the in-memory fallback (returns null) when the schema REJECTS a poisoned Redis blob', async () => {
    // Covers the T1.7 fix: replace `JSON.parse(value) as TPayload` with
    // `schema.safeParse(...)`. A blob that does NOT match the schema (post-
    // deploy shape drift, corrupted entry, attacker-controlled write, …) MUST
    // NOT leak through to the use case as a typed `TPayload`.
    const redis = makeFakeRedis();
    const adapter = new RedisSocialOtcStore<FakeSession>(redis, {
      schema: fakeSessionSchema,
    });

    // Seed Redis directly with a JSON blob that misses the required `user.id`
    // field — schema.safeParse(...) MUST reject it.
    const poisonedCode = 'poisoned-code-xyz';
    redis.store.set(`oidc:otc:${poisonedCode}`, JSON.stringify({ wrong: 'shape' }));

    await expect(adapter.consume(poisonedCode)).resolves.toBeNull();
    // The poisoned entry was atomically removed by getdel — Redis no longer
    // holds it after the failed consume.
    expect(redis.store.has(`oidc:otc:${poisonedCode}`)).toBe(false);
  });

  it('consume() returns null when Redis has no entry and no fallback entry exists', async () => {
    const redis = makeFakeRedis();
    const adapter = new RedisSocialOtcStore<FakeSession>(redis, {
      schema: fakeSessionSchema,
    });
    await expect(adapter.consume('never-issued')).resolves.toBeNull();
  });
});
