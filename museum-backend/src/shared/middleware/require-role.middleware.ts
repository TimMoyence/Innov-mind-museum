import { UserRole } from '@modules/auth/domain/user/user-role';

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

    if (user.role === UserRole.SUPER_ADMIN || allowedRoles.includes(user.role)) {
      next();
      return;
    }

    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
    });
  };
}
