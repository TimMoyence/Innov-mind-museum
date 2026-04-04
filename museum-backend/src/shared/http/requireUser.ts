import { unauthorized } from '@shared/errors/app.error';

import type { UserJwtPayload } from '@shared/types/auth/user-jwt-payload';
import type { Request } from 'express';

/**
 * Extracts the authenticated user from the request.
 * Must be called AFTER isAuthenticated middleware.
 *
 * @throws {AppError} 401 if user is not present on the request.
 */
export function requireUser(req: Request): UserJwtPayload {
  const user = req.user;
  if (!user?.id) {
    throw unauthorized('Authentication required');
  }
  return user;
}
