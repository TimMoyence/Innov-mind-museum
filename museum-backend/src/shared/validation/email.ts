/**
 * Validates the format of an email address.
 *
 * @param email - The email address to validate.
 * @returns `true` if the address matches the expected format, `false` otherwise.
 */
export function validateEmail(email: string): boolean {
  // This regex covers the most common cases.
  // For stricter validation, a dedicated library could be used.
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
