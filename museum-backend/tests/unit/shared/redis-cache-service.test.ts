import { RedisCacheService } from '@shared/cache/redis-cache.service';

// ── Mock ioredis ──────────────────────────────────────────────────────

const mockRedis = {
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  scan: jest.fn().mockResolvedValue(['0', []]),
  ping: jest.fn().mockResolvedValue('PONG'),
};

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn(() => mockRedis),
  };
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('RedisCacheService', () => {
  let cache: RedisCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new RedisCacheService({ url: 'redis://localhost:6379', defaultTtlSeconds: 60 });
  });

  // ── connect / disconnect ──────────────────────────────────────────

  describe('connect', () => {
    it('calls redis.connect', async () => {
      await cache.connect();
      expect(mockRedis.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('calls redis.quit', async () => {
      await cache.disconnect();
      expect(mockRedis.quit).toHaveBeenCalledTimes(1);
    });
  });

  // ── get ────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns deserialized value on cache hit', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ name: 'Monet' }));

      const result = await cache.get<{ name: string }>('artist:1');

      expect(result).toEqual({ name: 'Monet' });
      expect(mockRedis.get).toHaveBeenCalledWith('artist:1');
    });

    it('returns null on cache miss', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await cache.get('missing-key');

      expect(result).toBeNull();
    });

    it('returns null on redis error (fail-open)', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await cache.get('failing-key');

      expect(result).toBeNull();
    });

    it('returns null when stored value is invalid JSON (fail-open)', async () => {
      mockRedis.get.mockResolvedValueOnce('not-valid-json{{{');

      const result = await cache.get('bad-json-key');

      expect(result).toBeNull();
    });
  });

  // ── set ────────────────────────────────────────────────────────────

  describe('set', () => {
    it('stores serialized value with default TTL', async () => {
      await cache.set('key1', { data: 'hello' });

      expect(mockRedis.set).toHaveBeenCalledWith('key1', '{"data":"hello"}', 'EX', 60);
    });

    it('stores serialized value with custom TTL', async () => {
      await cache.set('key2', 'value', 120);

      expect(mockRedis.set).toHaveBeenCalledWith('key2', '"value"', 'EX', 120);
    });

    it('swallows redis errors silently (fail-open)', async () => {
      mockRedis.set.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(cache.set('key', 'value')).resolves.toBeUndefined();
    });
  });

  // ── del ────────────────────────────────────────────────────────────

  describe('del', () => {
    it('deletes the specified key', async () => {
      await cache.del('key1');

      expect(mockRedis.del).toHaveBeenCalledWith('key1');
    });

    it('swallows redis errors silently (fail-open)', async () => {
      mockRedis.del.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(cache.del('key')).resolves.toBeUndefined();
    });
  });

  // ── delByPrefix ───────────────────────────────────────────────────

  describe('delByPrefix', () => {
    it('scans and deletes all matching keys', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['42', ['session:1:a', 'session:1:b']])
        .mockResolvedValueOnce(['0', ['session:1:c']]);

      await cache.delByPrefix('session:1:');

      expect(mockRedis.scan).toHaveBeenCalledWith('0', 'MATCH', 'session:1:*', 'COUNT', 100);
      expect(mockRedis.scan).toHaveBeenCalledWith('42', 'MATCH', 'session:1:*', 'COUNT', 100);
      expect(mockRedis.del).toHaveBeenCalledWith('session:1:a', 'session:1:b');
      expect(mockRedis.del).toHaveBeenCalledWith('session:1:c');
    });

    it('does nothing when scan returns no keys', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', []]);

      await cache.delByPrefix('empty:');

      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('swallows redis errors silently (fail-open)', async () => {
      mockRedis.scan.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(cache.delByPrefix('prefix:')).resolves.toBeUndefined();
    });
  });

  // ── setNx ─────────────────────────────────────────────────────────

  describe('setNx', () => {
    it('returns true when key is set successfully', async () => {
      mockRedis.set.mockResolvedValueOnce('OK');

      const result = await cache.setNx('lock:1', 'holder', 30);

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith('lock:1', '"holder"', 'EX', 30, 'NX');
    });

    it('returns false when key already exists', async () => {
      mockRedis.set.mockResolvedValueOnce(null);

      const result = await cache.setNx('lock:1', 'holder', 30);

      expect(result).toBe(false);
    });

    it('returns false on redis error (fail-open)', async () => {
      mockRedis.set.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await cache.setNx('lock:1', 'holder', 30);

      expect(result).toBe(false);
    });
  });

  // ── ping ──────────────────────────────────────────────────────────

  describe('ping', () => {
    it('returns true when redis is reachable', async () => {
      mockRedis.ping.mockResolvedValueOnce('PONG');

      const result = await cache.ping();

      expect(result).toBe(true);
    });

    it('returns false on connection failure', async () => {
      mockRedis.ping.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await cache.ping();

      expect(result).toBe(false);
    });
  });

  // ── default TTL fallback ──────────────────────────────────────────

  describe('default TTL', () => {
    it('uses 300s when no defaultTtlSeconds is provided', async () => {
      const defaultCache = new RedisCacheService({ url: 'redis://localhost:6379' });
      await defaultCache.set('key', 'value');

      expect(mockRedis.set).toHaveBeenCalledWith('key', '"value"', 'EX', 300);
    });
  });
});
