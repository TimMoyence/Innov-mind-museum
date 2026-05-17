import { unauthorized } from '@shared/errors/app.error';

import type { UserJwtPayload } from '@shared/types/auth/user-jwt-payload';
import type { Request } from 'express';

/**
 * Ordering: must be called AFTER isAuthenticated middleware.
 *
 * @throws {AppError} 401 if user not present.
 */
export function requireUser(req: Request): UserJwtPayload {
  const user = req.user;
  if (!user?.id) {
    throw unauthorized('Authentication required');
  }
  return user;
}
