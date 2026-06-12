/**
 * Helper (TEST-ONLY) — `qualitySamplesFromProfile`.
 *
 * The single point of truth turning a ratified {@link NetworkProfile}'s
 * `latencyMs` / `lossPct` into a DETERMINISTIC synthetic sample stream for the
 * INV-17(b) registry self-test volet: replaying the registry through the REAL
 * quality engine must land on the profile's declared `expectedQuality`
 * (design §2.8 — deriving samples inside each test would re-implement this
 * mapping N times).
 *
 * Derivation contract (zero `Math.random` / `Date.now`, INV-06 spirit):
 *   - `failCount = Math.round(profile.lossPct × count)`; the FIRST `failCount`
 *     samples are failures `{ok:false, timedOut:true}`; the remaining samples
 *     succeed at the profile latency `{ok:true, rttMs: profile.latencyMs}`.
 *   - `atMs = startAtMs + i × spacingMs` (strictly monotone, engine-compatible).
 *
 * NEVER imported by `app/**` — enforced by the `no-restricted-imports` boundary
 * (eslint.config.mjs). FE-only helper, OUTSIDE the FE↔BE data region (the
 * backend has no quality engine).
 */
import type { NetworkProfile } from '@/shared/infrastructure/connectivity/networkProfiles';
import type { QualitySample } from '@/shared/infrastructure/connectivity/networkQuality';

/**
 * Builds the deterministic sample stream for a profile.
 *
 * @param profile a ratified network profile.
 * @param opts.count number of samples (default 10).
 * @param opts.startAtMs timestamp of the first sample (default 0).
 * @param opts.spacingMs gap between consecutive samples (default 1000).
 */
export function qualitySamplesFromProfile(
  profile: NetworkProfile,
  opts?: { count?: number; startAtMs?: number; spacingMs?: number },
): QualitySample[] {
  const count = opts?.count ?? 10;
  const startAtMs = opts?.startAtMs ?? 0;
  const spacingMs = opts?.spacingMs ?? 1000;
  const failCount = Math.round(profile.lossPct * count);

  return Array.from({ length: count }, (_, i): QualitySample => {
    const failed = i < failCount;
    return {
      rttMs: profile.latencyMs,
      ok: !failed,
      timedOut: failed,
      atMs: startAtMs + i * spacingMs,
    };
  });
}
