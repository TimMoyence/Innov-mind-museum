import { authSessionService } from '@modules/auth/useCase';
import { AppError, unauthorized } from '@shared/errors/app.error';
import { setUser } from '@shared/observability/sentry';

import type { IAccessTokenDenylist } from '@modules/auth/domain/session/access-token-denylist.port';
import type { Request, Response, NextFunction } from 'express';

const tokenRevoked = (): AppError =>
  new AppError({ message: 'Token revoked', statusCode: 401, code: 'TOKEN_REVOKED' });

/**
 * Module-level denylist port. Defaults to a no-op (test-runner with no Redis,
 * dev paths). Composition root `index.ts::initCacheAndRateLimit` calls
 * {@link setAccessTokenDenylist} with the `RedisAccessTokenDenylist` adapter
 * when `env.cache?.enabled === true`. Pattern mirrors `setLlmCostCounter` /
 * `setRedisRateLimitStore` (R7 design §3.1 D6).
 */
let denylist: IAccessTokenDenylist = {
  add: () => Promise.resolve(),
  has: () => Promise.resolve(false),
};

export const setAccessTokenDenylist = (d: IAccessTokenDenylist): void => {
  denylist = d;
};

/**
 * SEC F7 dual auth: Bearer (mobile, precedence) OR `access_token` cookie (web admin).
 * Bearer wins when both present → mobile webviews carrying stray cookies can't swap identity.
 */
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

/**
 * R8 — after `verifyAccessTokenWithClaims` succeeds, the JWT `jti` is checked
 * against the {@link IAccessTokenDenylist}. A denylisted jti throws 401
 * `TOKEN_REVOKED`. The denylist adapter is fail-OPEN on backing-store error
 * (Redis down → token accepted, spec §R9) so the middleware never has to
 * defend against denylist throws.
 *
 * @throws {AppError} 401 on missing/invalid credential OR revoked token.
 */
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
