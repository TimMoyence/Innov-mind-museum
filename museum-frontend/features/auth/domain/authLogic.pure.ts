import { baseJwtPayloadSchema, decodeJwtPayload } from '../../../shared/auth/jwt-decode';

import type { AppError } from '@/shared/types/AppError';

export const extractUserIdFromToken = (accessToken: string): string | null => {
  const payload = decodeJwtPayload(accessToken, baseJwtPayloadSchema);
  if (!payload) return null;
  const userId = payload.id ?? payload.sub;
  return userId !== undefined ? String(userId) : null;
};

export const getTokenExpiryMs = (token: string): number | null => {
  const payload = decodeJwtPayload(token, baseJwtPayloadSchema);
  if (!payload?.exp) return null;
  return payload.exp * 1000;
};

export const isAccessTokenExpired = (token: string | null, skewMs = 60_000): boolean => {
  if (!token) return true;
  const expiry = getTokenExpiryMs(token);
  if (expiry === null) return true;
  return Date.now() + skewMs >= expiry;
};

export const isAuthInvalidError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const kind = (error as AppError).kind;
  return kind === 'Unauthorized' || kind === 'Forbidden';
};
