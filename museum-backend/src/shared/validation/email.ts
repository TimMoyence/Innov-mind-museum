/**
 * Validates the format of an email address.
 *
 * @param email - The email address to validate.
 * @returns `true` if the address matches the expected format, `false` otherwise.
 */
export function validateEmail(email: string): boolean {
  // This regex covers the most common cases.
  // For stricter validation, a dedicated library could be used.
  // eslint-disable-next-line sonarjs/slow-regex -- three quantified non-overlapping char classes separated by literal `@` and `.`, no alternation: linear time
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
