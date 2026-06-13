/**
 * RED — C-R2 (cluster cost-consumers, run undefined-network-detection-reliability).
 *
 * `resolveCompressionMode({ resolved, preference, metered })` — D-06: upload
 * compression sits on the COST+QUALITY axes. Mode is 'low' iff
 * `resolved === 'low'` OR (`preference === 'auto'` AND `metered`), otherwise
 * 'normal'. ADDITIVE to `decideCompression` — its frozen suite
 * (`compressionDecision.pure.test.ts`) is untouched and must stay green (P-09).
 *
 * Invariants covered:
 * - INV-02 — metered drives ONLY cost decisions (here: upload compression);
 * - INV-03 — explicit preferences win on both axes (US-08.1/08.2);
 * - US-02.3 — metered + pref 'auto' + resolved 'normal' ⇒ aggressive profile.
 *
 * The matrix enumerates the RESOLVER-REACHABLE cells only (resolveDataMode
 * guarantees pref 'low' ⇒ resolved 'low' and pref 'normal' ⇒ resolved 'normal';
 * cross combinations are unreachable by construction and left unconstrained).
 */
import { resolveCompressionMode } from '@/features/chat/application/compressionDecision.pure';

interface MatrixCell {
  resolved: 'low' | 'normal';
  preference: 'auto' | 'low' | 'normal';
  metered: boolean;
  expected: 'low' | 'normal';
  why: string;
}

const MATRIX: MatrixCell[] = [
  // preference 'auto' — both resolved values reachable
  {
    resolved: 'low',
    preference: 'auto',
    metered: true,
    expected: 'low',
    why: 'quality low (INV-05) + metered',
  },
  {
    resolved: 'low',
    preference: 'auto',
    metered: false,
    expected: 'low',
    why: 'quality low alone forces aggressive',
  },
  {
    resolved: 'normal',
    preference: 'auto',
    metered: true,
    expected: 'low',
    why: 'US-02.3 — metered cost gate in auto',
  },
  {
    resolved: 'normal',
    preference: 'auto',
    metered: false,
    expected: 'normal',
    why: 'healthy non-metered keeps legacy',
  },
  // preference 'low' ⇒ resolved 'low' (resolver INV-03) — always aggressive (US-08.1)
  {
    resolved: 'low',
    preference: 'low',
    metered: true,
    expected: 'low',
    why: 'US-08.1 explicit low',
  },
  {
    resolved: 'low',
    preference: 'low',
    metered: false,
    expected: 'low',
    why: 'US-08.1 explicit low, non-metered',
  },
  // preference 'normal' ⇒ resolved 'normal' (resolver INV-03) — bypasses cost gate (US-08.2)
  {
    resolved: 'normal',
    preference: 'normal',
    metered: true,
    expected: 'normal',
    why: 'US-08.2 normal bypasses metered',
  },
  {
    resolved: 'normal',
    preference: 'normal',
    metered: false,
    expected: 'normal',
    why: 'US-08.2 full experience',
  },
];

describe('resolveCompressionMode (pure, D-06 matrix — INV-02/INV-03/US-02.3)', () => {
  it.each(MATRIX)(
    "resolved=$resolved pref=$preference metered=$metered → '$expected' ($why)",
    ({ resolved, preference, metered, expected }) => {
      expect(resolveCompressionMode({ resolved, preference, metered })).toBe(expected);
    },
  );

  it("never returns the dead 'edge' mode (UFR-016 — output is strictly 'low' | 'normal')", () => {
    for (const { resolved, preference, metered } of MATRIX) {
      const mode = resolveCompressionMode({ resolved, preference, metered });
      expect(['low', 'normal']).toContain(mode);
    }
  });
});
