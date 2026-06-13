/**
 * B-R2 (RED) — helper `qualitySamplesFromProfile` (NEW, design §2.8).
 *
 * The single point of truth that turns a ratified profile's `latencyMs` /
 * `lossPct` into a DETERMINISTIC synthetic sample stream for the INV-17(b)
 * self-test volet (replaying the registry through the REAL quality engine).
 * Deriving samples inside each test would re-implement this mapping N times —
 * one named helper + its own mini-test instead (design §2.8 rationale).
 *
 * Pinned derivation contract (deterministic — zero Math.random/Date.now):
 *   - defaults: count=10, startAtMs=0, spacingMs=1000
 *   - failCount = Math.round(profile.lossPct × count); the FIRST failCount
 *     samples are failures {ok:false, timedOut:true}; the remaining samples
 *     are {ok:true, rttMs: profile.latencyMs}
 *   - atMs = startAtMs + i × spacingMs (monotone, engine-compatible)
 *
 * RED: the module `@/shared/testing/qualitySamplesFromProfile` does not exist
 * yet — the import fails, the suite is red until B-G1.
 *
 * lib-docs: none (pure test-only helper).
 * No inline test entities — profiles from the registry, samples from the
 * helper under test; assertions are property-wise (no shape literals).
 */
import { NETWORK_PROFILES } from '@/shared/infrastructure/connectivity/networkProfiles';
import { qualitySamplesFromProfile } from '@/shared/testing/qualitySamplesFromProfile';

describe('qualitySamplesFromProfile (B-R2, INV-17 b)', () => {
  it('is deterministic: two runs over the same profile yield identical streams (INV-06 spirit)', () => {
    const first = qualitySamplesFromProfile(NETWORK_PROFILES['cellular-degraded']);
    const second = qualitySamplesFromProfile(NETWORK_PROFILES['cellular-degraded']);

    expect(second).toEqual(first);
  });

  it('defaults to 10 samples spaced 1000 ms apart starting at t=0', () => {
    const samples = qualitySamplesFromProfile(NETWORK_PROFILES.normal);

    expect(samples).toHaveLength(10);
    samples.forEach((sample, i) => {
      expect(sample.atMs).toBe(i * 1000);
    });
  });

  it('derives failCount = round(lossPct × count): cellular-degraded (loss 0.3) → first 3 fail', () => {
    const profile = NETWORK_PROFILES['cellular-degraded'];
    const samples = qualitySamplesFromProfile(profile);

    const failures = samples.filter((s) => !s.ok);
    expect(failures).toHaveLength(Math.round(profile.lossPct * 10));
    expect(failures).toHaveLength(3);

    // The failures are the FIRST samples, flagged as timeouts.
    samples.slice(0, 3).forEach((sample) => {
      expect(sample.ok).toBe(false);
      expect(sample.timedOut).toBe(true);
    });
    // The rest succeed at the profile's latency.
    samples.slice(3).forEach((sample) => {
      expect(sample.ok).toBe(true);
      expect(sample.timedOut).toBe(false);
      expect(sample.rttMs).toBe(profile.latencyMs);
    });
  });

  it('rounds the failure count: 3g-lossy (loss 0.08, count 10) → exactly 1 leading failure', () => {
    const profile = NETWORK_PROFILES['3g-lossy'];
    const samples = qualitySamplesFromProfile(profile);

    expect(samples.filter((s) => !s.ok)).toHaveLength(1);
    expect(samples[0]?.ok).toBe(false);
    expect(samples[0]?.timedOut).toBe(true);
    samples.slice(1).forEach((sample) => {
      expect(sample.ok).toBe(true);
      expect(sample.rttMs).toBe(profile.latencyMs);
    });
  });

  it('emits zero failures for lossless profiles (2g rounds to 0; 4g/5g/normal are 0)', () => {
    // 2g: round(0.02 × 10) = 0 — every sample ok at 350 ms.
    const twoG = qualitySamplesFromProfile(NETWORK_PROFILES['2g']);
    expect(twoG.every((s) => s.ok && !s.timedOut)).toBe(true);
    expect(twoG.every((s) => s.rttMs === NETWORK_PROFILES['2g'].latencyMs)).toBe(true);

    for (const name of ['4g', '5g', 'normal', 'wifi-metered'] as const) {
      const samples = qualitySamplesFromProfile(NETWORK_PROFILES[name]);
      expect(samples.every((s) => s.ok && !s.timedOut)).toBe(true);
      expect(samples.every((s) => s.rttMs === NETWORK_PROFILES[name].latencyMs)).toBe(true);
    }
  });

  it('marks every sample as failed for offline (lossPct 1)', () => {
    const samples = qualitySamplesFromProfile(NETWORK_PROFILES.offline);

    expect(samples).toHaveLength(10);
    expect(samples.every((s) => !s.ok && s.timedOut)).toBe(true);
  });

  it('honours custom count/startAtMs/spacingMs (failCount re-rounds against count)', () => {
    const profile = NETWORK_PROFILES['cellular-degraded'];
    const samples = qualitySamplesFromProfile(profile, {
      count: 5,
      startAtMs: 500,
      spacingMs: 200,
    });

    expect(samples).toHaveLength(5);
    samples.forEach((sample, i) => {
      expect(sample.atMs).toBe(500 + i * 200);
    });
    // round(0.3 × 5) = 2 leading failures.
    expect(samples.filter((s) => !s.ok)).toHaveLength(2);
    expect(samples[0]?.ok).toBe(false);
    expect(samples[1]?.ok).toBe(false);
    expect(samples[2]?.ok).toBe(true);
  });

  it('produces monotone timestamps consumable by the engine (atMs strictly increasing)', () => {
    const samples = qualitySamplesFromProfile(NETWORK_PROFILES['3g-lossy']);

    for (let i = 1; i < samples.length; i += 1) {
      const previous = samples[i - 1];
      const current = samples[i];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      expect((current as { atMs: number }).atMs).toBeGreaterThan(
        (previous as { atMs: number }).atMs,
      );
    }
  });
});
