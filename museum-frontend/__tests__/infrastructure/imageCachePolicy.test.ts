import { selectEvictions } from '@/features/chat/infrastructure/imageCachePolicy.pure';
import { makeCacheIndex } from '../helpers/factories';

describe('imageCachePolicy.pure — selectEvictions', () => {
  describe('LRU eviction under cap pressure', () => {
    it('evicts the least-recently-used entries until under cap', () => {
      const index = makeCacheIndex([
        ['a', { sizeBytes: 50, lastAccessMs: 10, createdMs: 10 }],
        ['b', { sizeBytes: 50, lastAccessMs: 20, createdMs: 20 }],
        ['c', { sizeBytes: 50, lastAccessMs: 30, createdMs: 30 }],
      ]);

      const result = selectEvictions(index, {
        capBytes: 100,
        maxAgeMs: 1_000_000,
        nowMs: 100,
      });

      expect(result.admit).toBe(true);
      expect(result.evictKeys).toEqual(['a']);
    });

    it('evicts multiple LRU entries when one is not enough', () => {
      const index = makeCacheIndex([
        ['a', { sizeBytes: 60, lastAccessMs: 1, createdMs: 1 }],
        ['b', { sizeBytes: 60, lastAccessMs: 2, createdMs: 2 }],
        ['c', { sizeBytes: 60, lastAccessMs: 3, createdMs: 3 }],
      ]);

      const result = selectEvictions(index, {
        capBytes: 100,
        maxAgeMs: 1_000_000,
        nowMs: 100,
      });

      expect(result.admit).toBe(true);
      expect(result.evictKeys).toEqual(['a', 'b']);
    });

    it('accounts for the incoming image size when deciding evictions', () => {
      const index = makeCacheIndex([
        ['a', { sizeBytes: 50, lastAccessMs: 1, createdMs: 1 }],
        ['b', { sizeBytes: 40, lastAccessMs: 2, createdMs: 2 }],
      ]);

      const result = selectEvictions(index, {
        capBytes: 100,
        maxAgeMs: 1_000_000,
        nowMs: 100,
        incomingSizeBytes: 30,
      });

      expect(result.admit).toBe(true);
      expect(result.evictKeys).toEqual(['a']);
    });

    it('evicts nothing when already under cap', () => {
      const index = makeCacheIndex([
        ['a', { sizeBytes: 10, lastAccessMs: 1, createdMs: 1 }],
        ['b', { sizeBytes: 10, lastAccessMs: 2, createdMs: 2 }],
      ]);

      const result = selectEvictions(index, {
        capBytes: 100,
        maxAgeMs: 1_000_000,
        nowMs: 100,
      });

      expect(result.admit).toBe(true);
      expect(result.evictKeys).toEqual([]);
    });
  });

  describe('age-based eviction independent of LRU', () => {
    it('evicts an over-maxAge entry even when under the byte cap', () => {
      const index = makeCacheIndex([
        ['fresh', { sizeBytes: 10, lastAccessMs: 90, createdMs: 90 }],
        ['stale', { sizeBytes: 10, lastAccessMs: 95, createdMs: 1 }],
      ]);

      const result = selectEvictions(index, {
        capBytes: 100,
        maxAgeMs: 50,
        nowMs: 100,
      });

      expect(result.admit).toBe(true);
      expect(result.evictKeys).toEqual(['stale']);
    });

    it('evicts a stale entry that is also the most-recently-accessed', () => {
      const index = makeCacheIndex([
        ['old-access', { sizeBytes: 10, lastAccessMs: 1, createdMs: 99 }],
        ['stale', { sizeBytes: 10, lastAccessMs: 99, createdMs: 1 }],
      ]);

      const result = selectEvictions(index, {
        capBytes: 100,
        maxAgeMs: 50,
        nowMs: 100,
      });

      expect(result.evictKeys).toContain('stale');
      expect(result.evictKeys).not.toContain('old-access');
    });
  });

  describe('oversized single-image admission guard', () => {
    it('rejects an incoming image larger than the cap without evicting everything', () => {
      const index = makeCacheIndex([
        ['a', { sizeBytes: 30, lastAccessMs: 1, createdMs: 90 }],
        ['b', { sizeBytes: 30, lastAccessMs: 2, createdMs: 90 }],
      ]);

      const result = selectEvictions(index, {
        capBytes: 100,
        maxAgeMs: 1_000_000,
        nowMs: 100,
        incomingSizeBytes: 200,
      });

      expect(result.admit).toBe(false);
      expect(result.evictKeys).not.toContain('a');
      expect(result.evictKeys).not.toContain('b');
    });
  });
});
