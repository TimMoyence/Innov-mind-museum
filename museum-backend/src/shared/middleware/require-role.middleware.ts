import { hasRole, type UserRole } from '@modules/auth/domain/user/user-role';

import type { Request, Response, NextFunction } from 'express';

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user?.role) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
      return;
    }

    if (hasRole(user.role, allowedRoles)) {
      next();
      return;
    }

    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
    });
  };
}
