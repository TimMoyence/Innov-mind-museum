/**
 * W1-REG-05 (RED) — flapScheduleAt duty-cycle phase math.
 *
 * Spec: master spec §"flapping duty cycle (shared schedule)" + tasks.md W1-REG-05.
 *   flapping.dutyCycle = { onlineMs:5000, offlineMs:3000, baseProfile:'3g-lossy' }.
 *   phase = elapsedMs % (onlineMs + offlineMs)  → period 8000.
 *   online = phase < onlineMs  → online for [0,5000) and [8000,13000); offline for [5000,8000).
 *   FlapTick = { online: boolean, baseProfile: NetworkProfile } where baseProfile
 *   resolves to NETWORK_PROFILES['3g-lossy'].
 *   Throws on a non-flapping profile (no dutyCycle).
 *
 * Pure/deterministic: elapsedMs is injected; no Date.now / Math.random (NFR).
 *
 * lib-docs: none (pure phase math, no external libs imported).
 * No inline test entities — boundaries are asserted against the registry itself.
 */
import {
  NETWORK_PROFILES,
  flapScheduleAt,
} from '@/shared/infrastructure/connectivity/networkProfiles';

const flapping = NETWORK_PROFILES.flapping;
const base = NETWORK_PROFILES['3g-lossy'];

describe('flapScheduleAt boundaries (W1-REG-05)', () => {
  it('online at the very start (elapsedMs=0)', () => {
    const tick = flapScheduleAt(flapping, 0);
    expect(tick.online).toBe(true);
    expect(tick.baseProfile).toBe(base);
  });

  it('online just before the online→offline boundary (elapsedMs=4999)', () => {
    expect(flapScheduleAt(flapping, 4999).online).toBe(true);
  });

  it('offline exactly at the online→offline boundary (elapsedMs=5000)', () => {
    expect(flapScheduleAt(flapping, 5000).online).toBe(false);
  });

  it('offline just before the offline→online boundary (elapsedMs=7999)', () => {
    expect(flapScheduleAt(flapping, 7999).online).toBe(false);
  });

  it('online exactly at the period wrap (elapsedMs=8000)', () => {
    const tick = flapScheduleAt(flapping, 8000);
    expect(tick.online).toBe(true);
    expect(tick.baseProfile).toBe(base);
  });

  it('offline in the second period (elapsedMs=13000 → phase 5000)', () => {
    expect(flapScheduleAt(flapping, 13000).online).toBe(false);
  });

  it('always returns the 3g-lossy base profile from the registry', () => {
    expect(flapScheduleAt(flapping, 0).baseProfile).toBe(NETWORK_PROFILES['3g-lossy']);
    expect(flapScheduleAt(flapping, 6000).baseProfile).toBe(NETWORK_PROFILES['3g-lossy']);
  });

  it('throws when given a non-flapping profile (no dutyCycle)', () => {
    expect(() => flapScheduleAt(NETWORK_PROFILES.normal, 0)).toThrow();
    expect(() => flapScheduleAt(NETWORK_PROFILES['2g'], 1000)).toThrow();
  });
});
