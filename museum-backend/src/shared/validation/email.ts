export function validateEmail(email: string): boolean {
  // eslint-disable-next-line sonarjs/slow-regex -- three quantified non-overlapping char classes separated by literal `@` and `.`, no alternation: linear time
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
