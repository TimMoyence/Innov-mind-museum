import type { AppError } from '@/shared/types/AppError';

export const extractUserIdFromToken = (accessToken: string): string | null => {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1])) as Record<string, unknown>;
    const userId = (payload.id ?? payload.sub) as string | number | undefined;
    return userId ? String(userId) : null;
  } catch {
    return null;
  }
};

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(atob(token.split('.')[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * Returns the JWT expiration timestamp (ms since epoch), or null when the token
 * cannot be decoded or lacks an `exp` claim.
 */
export const getTokenExpiryMs = (token: string): number | null => {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const exp = payload.exp;
  return typeof exp === 'number' ? exp * 1000 : null;
};

/**
 * Returns true when the token is missing, undecodable, or will expire within
 * `skewMs` (default 60s — covers clock skew and avoids using a token that is
 * about to expire mid-request).
 */
export const isAccessTokenExpired = (token: string | null, skewMs = 60_000): boolean => {
  if (!token) return true;
  const expiry = getTokenExpiryMs(token);
  if (expiry === null) return true;
  return Date.now() + skewMs >= expiry;
};

/**
 * A refresh error is "auth-invalid" (→ force logout) only when the backend
 * explicitly rejects the refresh token. Network/timeout/server errors MUST
 * keep the session so a transient outage doesn't log the user out.
 */
export const isAuthInvalidError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const kind = (error as AppError).kind;
  return kind === 'Unauthorized' || kind === 'Forbidden';
};
