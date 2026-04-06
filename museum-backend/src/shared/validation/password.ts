/**
 * Password strength validation for user registration and password reset.
 *
 * @module shared/validation/password
 */

/** Result of a password validation check. */
interface PasswordValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates a password against the application's strength policy.
 * Requirements: 8-128 characters, at least one lowercase, one uppercase, and one digit.
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

  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one lowercase letter' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one uppercase letter' };
  }

  if (!/\d/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one digit' };
  }

  return { valid: true };
};
