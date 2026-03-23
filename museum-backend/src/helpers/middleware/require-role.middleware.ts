import { Request, Response, NextFunction } from 'express';
import type { UserRole } from '@modules/auth/core/domain/user-role';

/**
 * Middleware factory that restricts access to users with one of the specified roles.
 * Must be placed AFTER isAuthenticated in the middleware chain.
 *
 * @param allowedRoles - One or more roles permitted to access the route.
 * @returns Express middleware that sends 403 if the user's role is not in allowedRoles.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user?.role || !allowedRoles.includes(user.role)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
      return;
    }

    next();
  };
}
