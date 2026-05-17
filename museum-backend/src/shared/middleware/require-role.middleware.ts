import { UserRole } from '@modules/auth/domain/user/user-role';

import type { Request, Response, NextFunction } from 'express';

/**
 * SEC: ordering — MUST be placed AFTER isAuthenticated.
 * `super_admin` implicitly satisfies any role check (see user-role.ts hierarchy). Call sites
 * list only the MINIMUM tier — escalation handled centrally so new admin endpoints can't
 * accidentally lock the platform owner out.
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
