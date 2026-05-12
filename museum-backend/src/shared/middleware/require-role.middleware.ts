import { UserRole } from '@modules/auth/domain/user/user-role';

import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware factory that restricts access to users with one of the specified roles.
 * Must be placed AFTER isAuthenticated in the middleware chain.
 *
 * `super_admin` implicitly satisfies any role check (see `user-role.ts`
 * hierarchy doc). Call sites only list the *minimum* tier required —
 * super_admin escalation is handled centrally so a new admin endpoint
 * cannot accidentally lock the platform owner out.
 *
 * @param allowedRoles - One or more roles permitted to access the route.
 * @returns Express middleware that sends 403 if the user's role is not in allowedRoles.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user?.role) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
      return;
    }

    if (user.role === UserRole.SUPER_ADMIN || allowedRoles.includes(user.role)) {
      next();
      return;
    }

    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
    });
  };
}
