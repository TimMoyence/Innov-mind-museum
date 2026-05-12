import { type NextFunction, type Request, type Response, Router } from 'express';

import { isAuthenticated } from '@shared/middleware/authenticated.middleware';

/**
 * GET /api/auth/super-admin-check — single-purpose RBAC gate consumed by
 * the production nginx `auth_request` directive that fronts `/grafana/*`.
 *
 * Contract intentionally narrow: 204 if the authenticated user holds
 * `super_admin`, 401 otherwise. Anything else (an authenticated `admin`,
 * a `visitor`, an anonymous request) gets 401. nginx forwards a 401
 * downstream → the iframe renders the museum-web denied state. A 5xx
 * here would risk nginx falling open via `auth_request_set` if mis-
 * configured; we trade verbosity for determinism.
 *
 * Cache-Control: `private, no-store` is set BEFORE `isAuthenticated`
 * runs — that way an anonymous 401 emitted by the auth middleware (which
 * never reaches the final handler) still carries the no-cache header.
 * This closes the theoretical gap where a CDN ever ended up in front of
 * `/api/auth/super-admin-check`.
 *
 * No body on either response: nginx reads the status only, and emitting
 * a body would tempt callers (or proxies) to inspect it.
 */
const superAdminCheckRouter: Router = Router();

/** Stamps the no-cache header before any auth check runs. */
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
