/**
 * TD-PC-02 — verify the `/metrics` endpoint sits behind `isAuthenticated` +
 * `requireRole(UserRole.SUPER_ADMIN)`. Public scrape was a leak vector :
 * internal label cardinality + breaker state + tenant_id + custom labels
 * would be exposed without auth.
 *
 * The 3 cases under contract :
 *   (a) no credential → 401
 *   (b) valid JWT but role != super_admin → 403
 *   (c) valid JWT with role == super_admin → 200 + Prom text body
 */

import express from 'express';
import request from 'supertest';

import { metricsHandler } from '@shared/observability/metrics-middleware';
import { enableDefaultMetrics } from '@shared/observability/prometheus-metrics';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { requireRole } from '@shared/middleware/require-role.middleware';
import { UserRole } from '@modules/auth/domain/user/user-role';
import { errorHandler } from '@shared/middleware/error.middleware';

jest.mock('@modules/auth/useCase', () => ({
  authSessionService: {
    verifyAccessToken: jest.fn(),
  },
}));

import { authSessionService } from '@modules/auth/useCase';

interface VerifiedUser {
  id: number;
  role: UserRole;
  museumId: number | null;
}

const verify = authSessionService.verifyAccessToken as jest.MockedFunction<
  (token: string) => VerifiedUser
>;

const buildApp = () => {
  enableDefaultMetrics();
  const app = express();
  app.get(
    '/metrics',
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'private, no-store');
      next();
    },
    isAuthenticated,
    requireRole(UserRole.SUPER_ADMIN),
    metricsHandler,
  );
  app.use(errorHandler);
  return app;
};

describe('/metrics — TD-PC-02 auth gate', () => {
  beforeEach(() => {
    verify.mockReset();
  });

  it('returns 401 when no Authorization header AND no access_token cookie', async () => {
    const app = buildApp();
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it('returns 403 when a valid JWT belongs to a non-super-admin role (visitor)', async () => {
    verify.mockReturnValue({ id: 7, role: UserRole.VISITOR, museumId: null });
    const app = buildApp();
    const res = await request(app)
      .get('/metrics')
      .set('Authorization', 'Bearer fake-visitor-token');
    expect(res.status).toBe(403);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when a valid JWT belongs to admin (not super_admin)', async () => {
    verify.mockReturnValue({ id: 8, role: UserRole.ADMIN, museumId: null });
    const app = buildApp();
    const res = await request(app).get('/metrics').set('Authorization', 'Bearer fake-admin-token');
    expect(res.status).toBe(403);
  });

  it('returns 200 + Prom text body when JWT belongs to super_admin', async () => {
    verify.mockReturnValue({ id: 1, role: UserRole.SUPER_ADMIN, museumId: null });
    const app = buildApp();
    const res = await request(app).get('/metrics').set('Authorization', 'Bearer fake-super-token');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    // Prom registry should have at least the default `process_*` collector lines.
    expect(res.text).toContain('process_');
    // Cache-Control no-store header sent by the upstream guard.
    expect(res.headers['cache-control']).toContain('no-store');
  });
});
