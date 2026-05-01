/**
 * Password strength validation for user registration and password reset.
 *
 * F10 (2026-04-30) — composition rules (uppercase / lowercase / digit) DROPPED
 * per NIST SP 800-63B-4 §3.1.1.2 ("Verifiers SHALL NOT impose other composition
 * rules"). Length range 8..128 retained per user gate D2 — raising the minimum
 * length is deferred to a UX-coordinated change. Breach-corpus check (HIBP
 * k-anonymity) lives in the sibling `password-breach-check.ts` module; callers
 * chain: synchronous `validatePassword` first, then async `assertPasswordNotBreached`.
 *
 * @module shared/validation/password
 */

/** Result of a password validation check. */
interface PasswordValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates a password's length range. Composition rules (NIST 800-63B-4) are
 * intentionally NOT enforced. Breach check is handled separately via
 * `assertPasswordNotBreached` in `password-breach-check.ts`.
 *
 * @param password - The plain-text password to validate.
 * @returns Validation result with an optional human-readable reason on failure.
 */
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
