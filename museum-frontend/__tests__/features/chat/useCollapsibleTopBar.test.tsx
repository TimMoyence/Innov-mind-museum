/**
 * Red tests for A4 — `deriveTopBarCollapsed` helper (hysteresis 80↓ / 40↑).
 *
 * Asserts the contract documented in `docs/chat-ux-refonte/specs/A4.md` §1.1
 * (R1-R7) + §4 (AC1-AC7) :
 *
 *   1. Constants exposed : TOP_BAR_COLLAPSE_THRESHOLD === 80, TOP_BAR_EXPAND_THRESHOLD === 40 (R5, AC1).
 *   2. Expanded state stays expanded at scrollY < 80 (R1, AC2-AC3).
 *   3. Expanded state collapses at scrollY >= 80 (R2, AC4).
 *   4. Collapsed state stays collapsed at scrollY >= 40 (R3, AC5-AC6).
 *   5. Collapsed state re-expands only at scrollY < 40 (R4, AC7).
 *   6. The helper is pure — same input → same output, no internal state (R6, R7).
 *
 * At baseline (A4 not yet implemented) :
 *   - `@/features/chat/application/useCollapsibleTopBar` does not exist.
 *     → Jest fails with "Cannot find module" at module load time.
 */

import '../../helpers/test-utils';

// RED ASSERTION 1 : module does not exist yet.
import {
  deriveTopBarCollapsed,
  TOP_BAR_COLLAPSE_THRESHOLD,
  TOP_BAR_EXPAND_THRESHOLD,
} from '@/features/chat/application/useCollapsibleTopBar';

describe('deriveTopBarCollapsed (A4 hysteresis)', () => {
  it('exposes TOP_BAR_COLLAPSE_THRESHOLD === 80 (R5, AC1)', () => {
    expect(TOP_BAR_COLLAPSE_THRESHOLD).toBe(80);
  });

  it('exposes TOP_BAR_EXPAND_THRESHOLD === 40 (R5, AC1)', () => {
    expect(TOP_BAR_EXPAND_THRESHOLD).toBe(40);
  });

  describe('expanded → expanded (scrollY < 80)', () => {
    it('returns false at scrollY = 0 (R1, AC2)', () => {
      expect(deriveTopBarCollapsed(0, false)).toBe(false);
    });

    it('returns false at scrollY = 50 (R1, AC2)', () => {
      expect(deriveTopBarCollapsed(50, false)).toBe(false);
    });

    it('returns false at scrollY = 79 (R1, AC3)', () => {
      expect(deriveTopBarCollapsed(79, false)).toBe(false);
    });
  });

  describe('expanded → collapsed (scrollY >= 80)', () => {
    it('returns true at scrollY = 80 (R2, AC4)', () => {
      expect(deriveTopBarCollapsed(80, false)).toBe(true);
    });

    it('returns true at scrollY = 200 (R2)', () => {
      expect(deriveTopBarCollapsed(200, false)).toBe(true);
    });
  });

  describe('collapsed → collapsed (scrollY >= 40 — hysteresis)', () => {
    it('stays collapsed at scrollY = 50 (R3, AC5)', () => {
      expect(deriveTopBarCollapsed(50, true)).toBe(true);
    });

    it('stays collapsed at scrollY = 40 (R3, AC6)', () => {
      expect(deriveTopBarCollapsed(40, true)).toBe(true);
    });

    it('stays collapsed at scrollY = 79 (R3)', () => {
      expect(deriveTopBarCollapsed(79, true)).toBe(true);
    });
  });

  describe('collapsed → expanded (scrollY < 40)', () => {
    it('re-expands at scrollY = 39 (R4, AC7)', () => {
      expect(deriveTopBarCollapsed(39, true)).toBe(false);
    });

    it('re-expands at scrollY = 0 (R4)', () => {
      expect(deriveTopBarCollapsed(0, true)).toBe(false);
    });
  });

  describe('purity (R6, R7)', () => {
    it('produces the same result for the same input over many calls', () => {
      for (let i = 0; i < 50; i++) {
        expect(deriveTopBarCollapsed(50, false)).toBe(false);
        expect(deriveTopBarCollapsed(100, false)).toBe(true);
        expect(deriveTopBarCollapsed(50, true)).toBe(true);
        expect(deriveTopBarCollapsed(20, true)).toBe(false);
      }
    });

    it('does not retain state between calls (each call is independent)', () => {
      // Call sequence that, if hysteresis was misimplemented as internal
      // state, could leak through: expanded → collapsed → expanded → ...
      deriveTopBarCollapsed(100, false); // would-be-internal: collapsed
      deriveTopBarCollapsed(20, true); // would-be-internal: expanded
      // But the function is pure — a fresh call with prev=false at scrollY=50
      // must still return false.
      expect(deriveTopBarCollapsed(50, false)).toBe(false);
    });
  });
});
