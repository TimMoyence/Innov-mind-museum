import { validatePassword } from '@shared/validation/password';

/**
 * F10 (2026-04-30) — composition rules dropped per NIST SP 800-63B-4 §3.1.1.2.
 * Length range 8..128 retained per user gate D2 (UX-conservative). Breach-corpus
 * checks (HIBP) live in `password-breach-check.test.ts`.
 */
describe('validatePassword (F10 — length-only)', () => {
  it('rejects empty password', () => {
    expect(validatePassword('')).toEqual({ valid: false, reason: 'Password is required' });
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
});
