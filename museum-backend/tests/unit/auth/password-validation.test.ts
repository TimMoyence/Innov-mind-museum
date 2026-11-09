import { validatePassword } from '@shared/validation/password';

describe('validatePassword (F10 — length-only)', () => {
  it('rejects empty password', () => {
    expect(validatePassword('')).toEqual({ valid: false, reason: 'Password is required' });
  });

  it('rejects non-string input via the typeof guard', () => {
    expect(validatePassword(null as unknown as string)).toEqual({
      valid: false,
      reason: 'Password is required',
    });
    expect(validatePassword(undefined as unknown as string)).toEqual({
      valid: false,
      reason: 'Password is required',
    });
  });

  it('rejects too short', () => {
    expect(validatePassword('Ab1')).toEqual({
      valid: false,
      reason: expect.stringContaining('at least 8'),
    });
  });

  it('rejects too long', () => {
    const long = 'a'.repeat(129);
    expect(validatePassword(long)).toEqual({
      valid: false,
      reason: expect.stringContaining('at most 128'),
    });
  });

  it('accepts an 8-character password without composition complexity', () => {
    expect(validatePassword('abcdefgh')).toEqual({ valid: true });
  });

  it('accepts a passphrase without uppercase or digits (NIST guidance)', () => {
    expect(validatePassword('correct horse battery staple')).toEqual({ valid: true });
  });

  it('accepts the legacy mixed-case-with-digit password (back-compat)', () => {
    expect(validatePassword('Abcdefg1')).toEqual({ valid: true });
  });

  it('accepts a complex password with symbols', () => {
    expect(validatePassword('MyP@ssw0rd!#')).toEqual({ valid: true });
  });

  it('accepts a password of exactly 128 characters (upper boundary inclusive)', () => {
    expect(validatePassword('a'.repeat(128))).toEqual({ valid: true });
  });

  it('rejects a password of exactly 129 characters (just above the limit)', () => {
    expect(validatePassword('a'.repeat(129))).toEqual({
      valid: false,
      reason: expect.stringContaining('at most 128'),
    });
  });
});
