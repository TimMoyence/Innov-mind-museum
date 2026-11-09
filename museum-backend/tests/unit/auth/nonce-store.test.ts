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
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22,}$/);
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
    nowMs += 2_000;
    await expect(store.consume(nonce)).resolves.toBe(false);
  });

  it('valid nonce inside TTL is consumed exactly once', async () => {
    let nowMs = 0;
    const store = new InMemoryNonceStore({ ttlSeconds: 60, now: () => nowMs });
    const nonce = await store.issue();
    nowMs += 30_000;
    await expect(store.consume(nonce)).resolves.toBe(true);
    await expect(store.consume(nonce)).resolves.toBe(false);
  });

  it('clear() drops all entries (test helper contract)', async () => {
    const store = new InMemoryNonceStore();
    const nonce = await store.issue();
    store.clear();
    await expect(store.consume(nonce)).resolves.toBe(false);
  });

  it('issue() with ttlSeconds=0 falls back to env default rather than treating 0 as a valid TTL', async () => {
    const previous = process.env.SOCIAL_NONCE_TTL_SECONDS;
    delete process.env.SOCIAL_NONCE_TTL_SECONDS;
    try {
      let nowMs = 1_000;
      const store = new InMemoryNonceStore({ ttlSeconds: 0, now: () => nowMs });
      const nonce = await store.issue();
      nowMs += 60_000;
      await expect(store.consume(nonce)).resolves.toBe(true);
    } finally {
      if (previous === undefined) delete process.env.SOCIAL_NONCE_TTL_SECONDS;
      else process.env.SOCIAL_NONCE_TTL_SECONDS = previous;
    }
  });

  it('consume() rejects a nonce whose expiresAt equals the current clock (boundary)', async () => {
    let nowMs = 0;
    const store = new InMemoryNonceStore({ ttlSeconds: 60, now: () => nowMs });
    const nonce = await store.issue();
    nowMs = 60_000;
    await expect(store.consume(nonce)).resolves.toBe(false);
  });

  it('resolveTtlSeconds falls back to 300s when env SOCIAL_NONCE_TTL_SECONDS is non-numeric', async () => {
    const previous = process.env.SOCIAL_NONCE_TTL_SECONDS;
    process.env.SOCIAL_NONCE_TTL_SECONDS = 'abc';
    try {
      let nowMs = 0;
      const store = new InMemoryNonceStore({ now: () => nowMs });
      const nonce = await store.issue();
      nowMs = 299_000;
      await expect(store.consume(nonce)).resolves.toBe(true);

      const nonce2 = await store.issue();
      nowMs = 299_000 + 301_000;
      await expect(store.consume(nonce2)).resolves.toBe(false);
    } finally {
      if (previous === undefined) delete process.env.SOCIAL_NONCE_TTL_SECONDS;
      else process.env.SOCIAL_NONCE_TTL_SECONDS = previous;
    }
  });

  it('issue() returns a nonce of exactly 22 base64url chars (16 bytes, no padding)', async () => {
    const store = new InMemoryNonceStore();
    const nonce = await store.issue();
    expect(nonce).toHaveLength(22);
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});

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

describe('socialNonceStore — delegating singleton swap', () => {
  afterEach(() => {
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
