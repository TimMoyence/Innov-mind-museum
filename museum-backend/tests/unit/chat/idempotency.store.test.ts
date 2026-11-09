import { type CacheService } from '@shared/cache/cache.port';

import {
  __setIdempotencyStoreForTest,
  configureIdempotency,
  remember,
} from '@modules/chat/useCase/message/idempotency.store';

import { InMemoryCacheService } from '../../helpers/cache/inMemoryCacheService';

const KEY_A = 'idem-key:user-42:sess-abc:k1';
const KEY_B = 'idem-key:user-42:sess-abc:k2';

interface StoredResult {
  status: number;
  body: { messageId: string };
}

const RESULT_ONE: StoredResult = { status: 201, body: { messageId: 'msg-1' } };
const RESULT_TWO: StoredResult = { status: 201, body: { messageId: 'msg-2' } };

describe('idempotency.store — remember() (in-memory cache backend)', () => {
  let cache: InMemoryCacheService;

  beforeEach(() => {
    cache = new InMemoryCacheService();
    __setIdempotencyStoreForTest(null);
    configureIdempotency({ cache });
  });

  afterEach(() => {
    __setIdempotencyStoreForTest(null);
  });

  it('runs the producer once on a miss and returns its result', async () => {
    const fn = jest.fn(async () => RESULT_ONE);

    const result = await remember(KEY_A, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual(RESULT_ONE);
  });

  it('replays the stored result on the second call WITHOUT re-running the producer', async () => {
    const fn = jest
      .fn<Promise<StoredResult>, []>()
      .mockResolvedValueOnce(RESULT_ONE)
      .mockResolvedValueOnce(RESULT_TWO);

    const first = await remember(KEY_A, fn);
    const second = await remember(KEY_A, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(first).toEqual(RESULT_ONE);
    expect(second).toEqual(RESULT_ONE);
  });

  it('runs the producer once per DISTINCT key (no cross-key collision)', async () => {
    const fnA = jest.fn(async () => RESULT_ONE);
    const fnB = jest.fn(async () => RESULT_TWO);

    const a = await remember(KEY_A, fnA);
    const b = await remember(KEY_B, fnB);

    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
    expect(a).toEqual(RESULT_ONE);
    expect(b).toEqual(RESULT_TWO);
  });

  it('treats the key as new (re-runs the producer) once the stored result has TTL-expired', async () => {
    const fn = jest
      .fn<Promise<StoredResult>, []>()
      .mockResolvedValueOnce(RESULT_ONE)
      .mockResolvedValueOnce(RESULT_TWO);

    const first = await remember(KEY_A, fn);
    expect(first).toEqual(RESULT_ONE);

    cache.clear();

    const second = await remember(KEY_A, fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(second).toEqual(RESULT_TWO);
  });
});

describe('idempotency.store — FAIL-OPEN on cache outage (spec R3)', () => {
  afterEach(() => {
    __setIdempotencyStoreForTest(null);
  });

  it('runs the producer (treats as new) when every cache op throws — never blocks the first send', async () => {
    const throwingCache = {
      get: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:6379');
      },
      set: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:6379');
      },
      del: async () => undefined,
      delByPrefix: async () => undefined,
      setNx: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:6379');
      },
      incrBy: async () => null,
      ping: async () => false,
      zadd: async () => undefined,
      ztop: async () => [],
    } as unknown as CacheService;
    configureIdempotency({ cache: throwingCache });

    const fn = jest.fn(async () => RESULT_ONE);

    const result = await remember(KEY_A, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual(RESULT_ONE);
  });

  it('never throws out of remember() even when the producer succeeds but the store write fails', async () => {
    const writeFailCache = {
      get: async () => null,
      set: async () => {
        throw new Error('redis down on write');
      },
      del: async () => undefined,
      delByPrefix: async () => undefined,
      setNx: async () => true,
      incrBy: async () => null,
      ping: async () => false,
      zadd: async () => undefined,
      ztop: async () => [],
    } as unknown as CacheService;
    configureIdempotency({ cache: writeFailCache });

    const fn = jest.fn(async () => RESULT_ONE);

    await expect(remember(KEY_A, fn)).resolves.toEqual(RESULT_ONE);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('idempotency.store — in-process adapter null-result is a MISS (parity with Redis)', () => {
  beforeEach(() => {
    __setIdempotencyStoreForTest(null);
    configureIdempotency({});
  });

  afterEach(() => {
    __setIdempotencyStoreForTest(null);
  });

  it('re-runs the producer when the previously stored result was null (not a replay HIT)', async () => {
    const fn = jest
      .fn<Promise<StoredResult | null>, []>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(RESULT_TWO);

    const first = await remember(KEY_A, fn);
    expect(first).toBeNull();

    const second = await remember(KEY_A, fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(second).toEqual(RESULT_TWO);
  });

  it('re-runs the producer when the previously stored result was undefined (not a replay HIT)', async () => {
    const fn = jest
      .fn<Promise<StoredResult | undefined>, []>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(RESULT_TWO);

    const first = await remember(KEY_A, fn);
    expect(first).toBeUndefined();

    const second = await remember(KEY_A, fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(second).toEqual(RESULT_TWO);
  });
});
