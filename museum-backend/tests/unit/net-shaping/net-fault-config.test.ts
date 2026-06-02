/**
 * W2-01 (RED) — resolveNetFaultEnabled prod-refusal gate.
 *
 * spec.md §EARS R5: WHEN NODE_ENV=production THE mw SHALL NEVER mount —
 *   `resolveNetFaultEnabled` coerces false UNCONDITIONALLY (NO escape hatch,
 *   stricter than `resolveChaosRate`) + emits a structured stderr refusal
 *   `{event:'net_fault_injection_refused'}`.
 * design.md §Verified anchors: mirrors `resolveChaosRate` (env-helpers.ts:87)
 *   structure BUT takes NO `escapeHatch` param. Default OFF.
 *
 * Decision D3 (master spec §Security): fault injection is OFF in prod with NO
 * way to turn it on at the helper boundary — distinct from chaos, which has the
 * `I-know-what-I-am-doing` hatch. There is deliberately NO third argument.
 *
 * RED state: `@src/config/net-fault.config` does not exist yet → the import
 * throws (module not found) → every assertion fails.
 *
 * lib-docs: none — pure function under test, no external lib imported (the
 *   stderr write uses node:process global, stdlib). No inline test entities;
 *   the unit is a referentially-transparent parser like `resolveChaosRate`.
 *
 * Frozen-test invariant: byte-immutable once manifested (phase=green).
 */
import { resolveNetFaultEnabled } from '@src/config/net-fault.config';

describe('resolveNetFaultEnabled — D3 prod-refusal gate (W2-01)', () => {
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('defaults OFF when the flag is undefined (any env)', () => {
    expect(resolveNetFaultEnabled(undefined, 'development')).toBe(false);
    expect(resolveNetFaultEnabled(undefined, 'test')).toBe(false);
    expect(resolveNetFaultEnabled(undefined, 'production')).toBe(false);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('returns false for falsy flag values regardless of env', () => {
    expect(resolveNetFaultEnabled('0', 'development')).toBe(false);
    expect(resolveNetFaultEnabled('false', 'development')).toBe(false);
    expect(resolveNetFaultEnabled('', 'test')).toBe(false);
  });

  it('returns true in development when the flag is truthy', () => {
    expect(resolveNetFaultEnabled('1', 'development')).toBe(true);
    expect(resolveNetFaultEnabled('true', 'development')).toBe(true);
    expect(resolveNetFaultEnabled('yes', 'test')).toBe(true);
    expect(resolveNetFaultEnabled('on', undefined)).toBe(true);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('coerces FALSE in production even when the flag is truthy — NO escape hatch', () => {
    expect(resolveNetFaultEnabled('1', 'production')).toBe(false);
    expect(resolveNetFaultEnabled('true', 'production')).toBe(false);
    expect(resolveNetFaultEnabled('yes', 'production')).toBe(false);
    expect(resolveNetFaultEnabled('on', 'production')).toBe(false);
  });

  it('emits a structured stderr refusal line in production when the flag was truthy', () => {
    const result = resolveNetFaultEnabled('true', 'production');
    expect(result).toBe(false);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = writeSpy.mock.calls[0]?.[0] as string;
    expect(written).toContain('net_fault_injection_refused');
    // Refusal line is valid JSON terminated by a newline (matches the
    // `resolveChaosRate` / `toIsoTimestamp` stderr convention).
    expect(written.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(written.trim()) as { event?: string; level?: string };
    expect(parsed.event).toBe('net_fault_injection_refused');
    expect(parsed.level).toBe('error');
  });

  it('does NOT emit a refusal line in production when the flag was already off', () => {
    expect(resolveNetFaultEnabled(undefined, 'production')).toBe(false);
    expect(resolveNetFaultEnabled('0', 'production')).toBe(false);
    expect(resolveNetFaultEnabled('false', 'production')).toBe(false);
    // No refusal noise for the nominal (disabled) prod case.
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('exposes a 2-arity signature — NO escape-hatch parameter (stricter than resolveChaosRate)', () => {
    // The function takes exactly (raw, nodeEnv). A third "escape hatch" arg
    // would re-introduce the prod footgun D3 forbids.
    expect(resolveNetFaultEnabled).toHaveLength(2);
  });
});
