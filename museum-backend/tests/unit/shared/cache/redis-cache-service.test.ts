import RedisCtor from 'ioredis';

import { RedisCacheService } from '@shared/cache/redis-cache.service';

interface MockRedis {
  connect: jest.Mock;
  quit: jest.Mock;
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  scan: jest.Mock;
  ping: jest.Mock;
  eval: jest.Mock;
  zincrby: jest.Mock;
  zrevrange: jest.Mock;
}

const mockRedisInstance: MockRedis = {
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  scan: jest.fn().mockResolvedValue(['0', []]),
  ping: jest.fn().mockResolvedValue('PONG'),
  eval: jest.fn().mockResolvedValue(0),
  zincrby: jest.fn().mockResolvedValue('1'),
  zrevrange: jest.fn().mockResolvedValue([]),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => mockRedisInstance),
}));

const RedisCtorMock = RedisCtor as unknown as jest.Mock;

const EXPECTED_LUA =
  "local v = redis.call('INCRBY', KEYS[1], ARGV[1]); redis.call('EXPIRE', KEYS[1], ARGV[2]); return v";

const makeCache = (defaultTtlSeconds = 60): RedisCacheService =>
  new RedisCacheService({ url: 'redis://localhost:6379', defaultTtlSeconds });

describe('RedisCacheService.destroy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RedisCtorMock.mockImplementation(() => mockRedisInstance);
  });

  it('calls redis.quit exactly once (kills L40 BlockStatement → {})', async () => {
    const cache = makeCache();
    await cache.destroy();
    expect(mockRedisInstance.quit).toHaveBeenCalledTimes(1);
    expect(mockRedisInstance.quit).toHaveBeenCalledWith();
  });

  it('resolves with undefined (the CacheService.destroy() contract)', async () => {
    const cache = makeCache();
    await expect(cache.destroy()).resolves.toBeUndefined();
  });

  it('is safe to call twice in a row (idempotent alias semantics)', async () => {
    const cache = makeCache();
    await cache.destroy();
    await cache.destroy();
    expect(mockRedisInstance.quit).toHaveBeenCalledTimes(2);
  });
});

describe('RedisCacheService.incrBy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RedisCtorMock.mockImplementation(() => mockRedisInstance);
  });

  it('returns null and skips eval when amount is NaN (kills L122 LogicalOperator + Number.isFinite branch)', async () => {
    const cache = makeCache();
    await expect(cache.incrBy('k', Number.NaN, 60)).resolves.toBeNull();
    expect(mockRedisInstance.eval).not.toHaveBeenCalled();
  });

  it('returns null and skips eval when amount is +Infinity (kills L122 BooleanLiteral mutant)', async () => {
    const cache = makeCache();
    await expect(cache.incrBy('k', Number.POSITIVE_INFINITY, 60)).resolves.toBeNull();
    expect(mockRedisInstance.eval).not.toHaveBeenCalled();
  });

  it('returns null and skips eval when amount === 0 (kills L122 EqualityOperator amount === 0 → !==)', async () => {
    const cache = makeCache();
    await expect(cache.incrBy('k', 0, 60)).resolves.toBeNull();
    expect(mockRedisInstance.eval).not.toHaveBeenCalled();
  });

  it('returns null and skips eval when ttlSeconds is NaN (kills L123 LogicalOperator + Number.isFinite branch)', async () => {
    const cache = makeCache();
    await expect(cache.incrBy('k', 5, Number.NaN)).resolves.toBeNull();
    expect(mockRedisInstance.eval).not.toHaveBeenCalled();
  });

  it('returns null when ttlSeconds is 0 (kills L123 EqualityOperator ttlSeconds <= 0 → <)', async () => {
    const cache = makeCache();
    await expect(cache.incrBy('k', 5, 0)).resolves.toBeNull();
    expect(mockRedisInstance.eval).not.toHaveBeenCalled();
  });

  it('returns null when ttlSeconds is negative (kills L123 EqualityOperator ttlSeconds <= 0 → >)', async () => {
    const cache = makeCache();
    await expect(cache.incrBy('k', 5, -1)).resolves.toBeNull();
    expect(mockRedisInstance.eval).not.toHaveBeenCalled();
  });

  it('invokes redis.eval with the exact Lua script, key, truncated amount, truncated ttl (kills L126 StringLiteral + L127 BlockStatement)', async () => {
    mockRedisInstance.eval.mockResolvedValueOnce(42);
    const cache = makeCache();

    const result = await cache.incrBy('counter:user:1', 7, 60);

    expect(result).toBe(42);
    expect(mockRedisInstance.eval).toHaveBeenCalledTimes(1);
    expect(mockRedisInstance.eval).toHaveBeenCalledWith(
      EXPECTED_LUA,
      1,
      'counter:user:1',
      '7',
      '60',
    );
  });

  it('truncates fractional amount and ttl via Math.trunc before passing as strings', async () => {
    mockRedisInstance.eval.mockResolvedValueOnce(3);
    const cache = makeCache();

    await cache.incrBy('k', 3.9, 9.99);

    expect(mockRedisInstance.eval).toHaveBeenCalledWith(EXPECTED_LUA, 1, 'k', '3', '9');
  });

  it('accepts a negative non-zero amount (decrement) — passes through the guard', async () => {
    mockRedisInstance.eval.mockResolvedValueOnce(-5);
    const cache = makeCache();

    const result = await cache.incrBy('k', -5, 30);

    expect(result).toBe(-5);
    expect(mockRedisInstance.eval).toHaveBeenCalledWith(EXPECTED_LUA, 1, 'k', '-5', '30');
  });

  it('returns the numeric result directly when typeof result === "number" (kills L135 EqualityOperator + StringLiteral)', async () => {
    mockRedisInstance.eval.mockResolvedValueOnce(99);
    const cache = makeCache();

    await expect(cache.incrBy('k', 1, 30)).resolves.toBe(99);
  });

  it('coerces string Redis result to number via Number(result) (kills L135 ConditionalExpression true mutant)', async () => {
    mockRedisInstance.eval.mockResolvedValueOnce('17');
    const cache = makeCache();

    await expect(cache.incrBy('k', 1, 30)).resolves.toBe(17);
  });

  it('returns null when Number(result) yields NaN (Number.isFinite gate)', async () => {
    mockRedisInstance.eval.mockResolvedValueOnce('not-a-number');
    const cache = makeCache();

    await expect(cache.incrBy('k', 1, 30)).resolves.toBeNull();
  });

  it('returns null when redis.eval rejects (kills L137 BlockStatement catch body)', async () => {
    mockRedisInstance.eval.mockRejectedValueOnce(new Error('redis-down'));
    const cache = makeCache();

    await expect(cache.incrBy('k', 1, 30)).resolves.toBeNull();
  });
});

describe('RedisCacheService.zadd', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RedisCtorMock.mockImplementation(() => mockRedisInstance);
  });

  it('invokes redis.zincrby with (key, increment, member) order — NOT (key, member, increment) (kills L158/L159 BlockStatement → {})', async () => {
    const cache = makeCache();
    await cache.zadd('leaderboard', 'artist-monet', 3);

    expect(mockRedisInstance.zincrby).toHaveBeenCalledTimes(1);
    expect(mockRedisInstance.zincrby).toHaveBeenCalledWith('leaderboard', 3, 'artist-monet');
  });

  it('resolves to undefined on the happy path', async () => {
    const cache = makeCache();
    await expect(cache.zadd('k', 'm', 1)).resolves.toBeUndefined();
  });

  it('swallows redis.zincrby rejections silently (fail-open)', async () => {
    mockRedisInstance.zincrby.mockRejectedValueOnce(new Error('redis-down'));
    const cache = makeCache();

    await expect(cache.zadd('k', 'm', 1)).resolves.toBeUndefined();
  });
});

describe('RedisCacheService.ztop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RedisCtorMock.mockImplementation(() => mockRedisInstance);
  });

  it('invokes redis.zrevrange with (key, 0, n - 1, "WITHSCORES") (kills L164 ArithmeticOperator + StringLiteral)', async () => {
    mockRedisInstance.zrevrange.mockResolvedValueOnce([]);
    const cache = makeCache();

    await cache.ztop('leaderboard', 5);

    expect(mockRedisInstance.zrevrange).toHaveBeenCalledTimes(1);
    expect(mockRedisInstance.zrevrange).toHaveBeenCalledWith('leaderboard', 0, 4, 'WITHSCORES');
  });

  it('parses the WITHSCORES interleaved array into { member, score } pairs in order (kills L165/L166/L167 mutants)', async () => {
    mockRedisInstance.zrevrange.mockResolvedValueOnce(['monet', '11', 'renoir', '5', 'degas', '3']);
    const cache = makeCache();

    const result = await cache.ztop('leaderboard', 3);

    expect(result).toEqual([
      { member: 'monet', score: 11 },
      { member: 'renoir', score: 5 },
      { member: 'degas', score: 3 },
    ]);
  });

  it('returns an empty array when redis returns no entries (kills L165 ArrayDeclaration baseline)', async () => {
    mockRedisInstance.zrevrange.mockResolvedValueOnce([]);
    const cache = makeCache();

    const result = await cache.ztop('empty', 10);

    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it('coerces non-numeric score strings via Number() — NaN scores propagate', async () => {
    mockRedisInstance.zrevrange.mockResolvedValueOnce(['only', '7']);
    const cache = makeCache();

    const [first] = await cache.ztop('k', 1);
    expect(first).toEqual({ member: 'only', score: 7 });
  });

  it('returns [] when redis.zrevrange rejects (kills L170 BlockStatement + L171 ArrayDeclaration mutants)', async () => {
    mockRedisInstance.zrevrange.mockRejectedValueOnce(new Error('redis-down'));
    const cache = makeCache();

    const result = await cache.ztop('k', 5);

    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });
});
