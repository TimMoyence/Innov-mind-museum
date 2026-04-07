import { NoopCacheService } from '@shared/cache/noop-cache.service';

import type { CacheService } from '@shared/cache/cache.port';

describe('CacheService zadd/ztop', () => {
  describe('NoopCacheService', () => {
    let cache: CacheService;

    beforeEach(() => {
      cache = new NoopCacheService();
    });

    it('zadd resolves without error', async () => {
      await expect(cache.zadd('key', 'member', 1)).resolves.toBeUndefined();
    });

    it('ztop returns empty array', async () => {
      await expect(cache.ztop('key', 10)).resolves.toEqual([]);
    });
  });
});
