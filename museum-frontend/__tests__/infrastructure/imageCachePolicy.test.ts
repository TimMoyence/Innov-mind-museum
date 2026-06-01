/**
 * RED tests for W1-D4-FE-01 — `imageCachePolicy.pure` eviction math.
 *
 * Pure function (NO expo-file-system, NO I/O) computing which cache entries to
 * evict so that a dedicated capped image cache (carnet re-download, design.md
 * §Architecture) stays under its byte cap, plus age-based eviction and an
 * oversized-single-image admission guard.
 *
 * Contract under test (spec.md R1):
 *   selectEvictions(
 *     index: Record<string, { sizeBytes; lastAccessMs; createdMs }>,
 *     opts:  { capBytes; maxAgeMs; nowMs; incomingSizeBytes? },
 *   ) => { evictKeys: string[]; admit: boolean }
 *
 *   - When total bytes (existing + incoming) exceed capBytes → evict LRU
 *     (oldest lastAccessMs first) until under cap.
 *   - An entry whose age (nowMs - createdMs) exceeds maxAgeMs is evictable
 *     regardless of LRU ordering / cap pressure.
 *   - A single incoming image larger than capBytes → admit:false and does NOT
 *     evict the whole cache (the over-cap image is simply rejected).
 *
 * At baseline the module does not exist → Jest fails at import (Cannot find
 * module). That non-zero exit is the SUCCESS of the RED phase.
 */

import { selectEvictions } from '@/features/chat/infrastructure/imageCachePolicy.pure';
import { makeCacheIndex } from '../helpers/factories';

describe('imageCachePolicy.pure — selectEvictions', () => {
  describe('LRU eviction under cap pressure', () => {
    it('evicts the least-recently-used entries until under cap', () => {
      // cap=100. Three entries of 50 each = 150 → over cap by 50.
      // Evicting the single oldest-accessed (a) brings total to 100 → under cap.
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
      // cap=100. a=40,b=40,c=40 = 120 → over by 20. Oldest-accessed first:
      // evict a (→80, under cap). Only one needed.
      // To force two, make entries 60 each = 180 over cap by 80; evict a(→120)
      // still over, evict b(→60) under. Expect [a,b].
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
      // cap=100. Existing a=50,b=40 = 90 (under). Incoming=30 → 120 over by 20.
      // Evict LRU a (→70 + incoming 30 = 100) under cap.
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
      // Under cap (20 < 100) but `stale` is older than maxAge → still evicted.
      const index = makeCacheIndex([
        ['fresh', { sizeBytes: 10, lastAccessMs: 90, createdMs: 90 }],
        ['stale', { sizeBytes: 10, lastAccessMs: 95, createdMs: 1 }],
      ]);

      const result = selectEvictions(index, {
        capBytes: 100,
        maxAgeMs: 50,
        nowMs: 100, // stale age = 99 > 50 ; fresh age = 10 < 50
      });

      expect(result.admit).toBe(true);
      expect(result.evictKeys).toEqual(['stale']);
    });

    it('evicts a stale entry that is also the most-recently-accessed', () => {
      // `stale` has the NEWEST lastAccessMs (would survive LRU) but is past
      // maxAge → age eviction must override recency.
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
        incomingSizeBytes: 200, // single image > cap
      });

      expect(result.admit).toBe(false);
      // Must NOT wipe the whole cache to make room for an image that can never fit.
      expect(result.evictKeys).not.toContain('a');
      expect(result.evictKeys).not.toContain('b');
    });
  });
});
