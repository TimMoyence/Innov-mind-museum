import { baseJwtPayloadSchema, decodeJwtPayload } from '@/shared/auth/jwt-decode';

import type { AppError } from '@/shared/types/AppError';

export const extractUserIdFromToken = (accessToken: string): string | null => {
  const payload = decodeJwtPayload(accessToken, baseJwtPayloadSchema);
  if (!payload) return null;
  const userId = payload.id ?? payload.sub;
  return userId !== undefined ? String(userId) : null;
};

/**
 * Returns the JWT expiration timestamp (ms since epoch), or null when the token
 * cannot be decoded or lacks an `exp` claim.
 */
export const getTokenExpiryMs = (token: string): number | null => {
  const payload = decodeJwtPayload(token, baseJwtPayloadSchema);
  if (!payload?.exp) return null;
  return payload.exp * 1000;
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
