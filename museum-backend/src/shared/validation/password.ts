// F10 (2026-04-30) — composition rules (upper/lower/digit) DROPPED per
// NIST SP 800-63B-4 §3.1.1.2 ("Verifiers SHALL NOT impose other composition
// rules"). Length 8..128 retained per user gate D2. Breach check (HIBP
// k-anonymity) in sibling `password-breach-check.ts`; chain:
// sync `validatePassword` then async `assertPasswordNotBreached`.

interface PasswordValidationResult {
  valid: boolean;
  /** Set when `valid` false. */
  reason?: string;
}

export const validatePassword = (password: string): PasswordValidationResult => {
  if (typeof password !== 'string' || password.length === 0) {
    return { valid: false, reason: 'Password is required' };
  }

  if (password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters' };
  }

  if (password.length > 128) {
    return { valid: false, reason: 'Password must be at most 128 characters' };
  }

  return { valid: true };
};
