import { charCount, TEXT_LIMITS } from '@musaium/shared';

interface PasswordValidationResult {
  valid: boolean;
  reason?: string;
}

export const validatePassword = (password: string): PasswordValidationResult => {
  if (typeof password !== 'string' || password.length === 0) {
    return { valid: false, reason: 'Password is required' };
  }

  const { min, max } = TEXT_LIMITS.password;
  const length = charCount(password);

  if (length < min) {
    return { valid: false, reason: `Password must be at least ${String(min)} characters` };
  }

  if (length > max) {
    return { valid: false, reason: `Password must be at most ${String(max)} characters` };
  }

  return { valid: true };
};
