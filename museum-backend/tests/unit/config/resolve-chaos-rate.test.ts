/**
 * Runtime guard test for `resolveChaosRate` (Phase 1 reviewer F3 fix).
 *
 * Spec §6 RO3 — a typo'd `GUARDRAIL_CHAOS_RATE` MUST NOT silently inject
 * sidecar aborts on real prod traffic. The escape hatch
 * `MUSAIUM_ALLOW_PROD_CHAOS=I-know-what-I-am-doing` is the single literal
 * that authorises chaos in production.
 */
import { resolveChaosRate } from '@src/config/env-helpers';

describe('resolveChaosRate — prod-refusal guard', () => {
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('returns 0 when raw is undefined regardless of env', () => {
    expect(resolveChaosRate(undefined, 'production', undefined)).toBe(0);
    expect(resolveChaosRate(undefined, 'development', undefined)).toBe(0);
  });

  it('returns 0 when raw is "0" regardless of env', () => {
    expect(resolveChaosRate('0', 'production', undefined)).toBe(0);
  });

  it('clamps and returns rate in non-production', () => {
    expect(resolveChaosRate('0.05', 'development', undefined)).toBeCloseTo(0.05);
    expect(resolveChaosRate('0.5', 'test', undefined)).toBeCloseTo(0.5);
  });

  it('clamps NaN / bogus to 0', () => {
    expect(resolveChaosRate('abc', 'development', undefined)).toBe(0);
    expect(resolveChaosRate('-1', 'production', undefined)).toBe(0);
    expect(resolveChaosRate('2', 'development', undefined)).toBe(1);
  });

  it('refuses non-zero in production WITHOUT the escape hatch — returns 0 + stderr log', () => {
    const result = resolveChaosRate('0.05', 'production', undefined);
    expect(result).toBe(0);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = writeSpy.mock.calls[0]?.[0] as string;
    expect(written).toContain('guardrail_chaos_rate_refused');
    expect(written).toContain('production_without_escape_hatch');
  });

  it('refuses non-zero in production with a WRONG escape-hatch value', () => {
    expect(resolveChaosRate('0.05', 'production', 'yes')).toBe(0);
    expect(resolveChaosRate('0.05', 'production', 'I-know')).toBe(0);
    expect(resolveChaosRate('0.05', 'production', 'i-know-what-i-am-doing')).toBe(0); // case-sensitive
    expect(writeSpy).toHaveBeenCalledTimes(3);
  });

  it('accepts non-zero in production with the exact escape-hatch literal', () => {
    const result = resolveChaosRate('0.05', 'production', 'I-know-what-I-am-doing');
    expect(result).toBeCloseTo(0.05);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
