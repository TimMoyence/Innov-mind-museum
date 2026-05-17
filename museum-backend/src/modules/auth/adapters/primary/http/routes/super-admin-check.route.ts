import { type NextFunction, type Request, type Response, Router } from 'express';

import { isAuthenticated } from '@shared/middleware/authenticated.middleware';

/**
 * Consumed by nginx `auth_request` fronting `/grafana/*`. 204 iff `super_admin`,
 * 401 otherwise (admin/visitor/anon). 5xx here would risk nginx fail-open via
 * `auth_request_set` misconfig — trade verbosity for determinism. No body —
 * nginx reads status only.
 *
 * Cache-Control set BEFORE `isAuthenticated` so anon 401 emitted by auth
 * middleware still carries no-cache (CDN protection if one ever fronts this).
 */
const superAdminCheckRouter: Router = Router();

function setNoStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
}

superAdminCheckRouter.get(
  '/super-admin-check',
  setNoStore,
  isAuthenticated,
  (req: Request, res: Response): void => {
    if (req.user?.role !== 'super_admin') {
      res.status(401).end();
      return;
    }
    res.status(204).end();
  },
);

export default superAdminCheckRouter;
