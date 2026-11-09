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
    expect(written.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(written.trim()) as { event?: string; level?: string };
    expect(parsed.event).toBe('net_fault_injection_refused');
    expect(parsed.level).toBe('error');
  });

  it('does NOT emit a refusal line in production when the flag was already off', () => {
    expect(resolveNetFaultEnabled(undefined, 'production')).toBe(false);
    expect(resolveNetFaultEnabled('0', 'production')).toBe(false);
    expect(resolveNetFaultEnabled('false', 'production')).toBe(false);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('exposes a 2-arity signature — NO escape-hatch parameter (stricter than resolveChaosRate)', () => {
    expect(resolveNetFaultEnabled).toHaveLength(2);
  });
});
