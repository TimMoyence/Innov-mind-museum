import { validatePassword } from '@shared/validation/password';

describe('validatePassword', () => {
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
    const long = 'Aa1' + 'x'.repeat(126);
    expect(validatePassword(long)).toEqual({
      valid: false,
      reason: expect.stringContaining('at most 128'),
    });
  });

  it('rejects no lowercase', () => {
    expect(validatePassword('ABCDEFG1')).toEqual({
      valid: false,
      reason: expect.stringContaining('lowercase'),
    });
  });

  it('rejects no uppercase', () => {
    expect(validatePassword('abcdefg1')).toEqual({
      valid: false,
      reason: expect.stringContaining('uppercase'),
    });
  });

  it('rejects no digit', () => {
    expect(validatePassword('Abcdefgh')).toEqual({
      valid: false,
      reason: expect.stringContaining('digit'),
    });
  });

  it('accepts valid password', () => {
    expect(validatePassword('Abcdefg1')).toEqual({ valid: true });
  });

  it('accepts complex password', () => {
    expect(validatePassword('MyP@ssw0rd!#')).toEqual({ valid: true });
  });
});
