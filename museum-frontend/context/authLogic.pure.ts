/**
 * Extracts the user ID from a JWT access token payload.
 * Looks for `id` or `sub` fields in the decoded payload.
 * @param accessToken - Raw JWT string (header.payload.signature).
 * @returns The user ID as a string, or `null` if extraction fails.
 */
export const extractUserIdFromToken = (accessToken: string): string | null => {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1])) as Record<string, unknown>;
    const userId = (payload.id ?? payload.sub) as string | number | undefined;
    return userId ? String(userId) : null;
  } catch {
    return null;
  }
};
