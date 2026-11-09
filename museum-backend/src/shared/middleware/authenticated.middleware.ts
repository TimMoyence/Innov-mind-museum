import { authSessionService } from '@modules/auth/useCase';
import { AppError, unauthorized } from '@shared/errors/app.error';
import { setUser } from '@shared/observability/sentry';

import type { IAccessTokenDenylist } from '@modules/auth/domain/session/access-token-denylist.port';
import type { Request, Response, NextFunction } from 'express';

const tokenRevoked = (): AppError =>
  new AppError({ message: 'Token revoked', statusCode: 401, code: 'TOKEN_REVOKED' });

let denylist: IAccessTokenDenylist = {
  add: () => Promise.resolve(),
  has: () => Promise.resolve(false),
};

export const setAccessTokenDenylist = (d: IAccessTokenDenylist): void => {
  denylist = d;
};

export function resolveCredential(req: Request): string | null {
  const bearer = req.headers.authorization?.split(' ')[1];
  if (bearer) {
    return bearer;
  }
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const cookieToken = cookies?.access_token;
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  return null;
}

export async function isAuthenticated(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = resolveCredential(req);
  if (!token) {
    throw unauthorized('Token required');
  }

  let claims;
  try {
    claims = authSessionService.verifyAccessTokenWithClaims(token);
  } catch {
    throw unauthorized('Invalid token');
  }
  if (await denylist.has(claims.jti)) {
    throw tokenRevoked();
  }
  req.user = { id: claims.id, role: claims.role, museumId: claims.museumId };
  req.museumId = claims.museumId ?? undefined;
  setUser({ id: String(claims.id) });
  next();
}
