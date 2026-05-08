/**
 * GET /api/auth/super-admin-check — single-purpose RBAC gate consumed by
 * the production nginx `auth_request` directive that fronts `/grafana/*`.
 *
 * Contract :
 *   - 204 No Content   — caller has a valid access token + role=super_admin
 *   - 401 Unauthorized — anonymous OR token lacks super_admin role
 *
 * The endpoint MUST stay 204/401 only. Any 5xx would degrade to "open" via
 * nginx `auth_request_set $auth_status` semantics — we want the gate to be
 * deterministic. Logged failures bubble up as 401 by design.
 */
import request from 'supertest';

import { createApp } from '@src/app';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';
import { adminToken, superAdminToken, visitorToken } from 'tests/helpers/auth/token.helpers';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

const app = createApp({
  chatService: {} as ChatService,
  healthCheck: async () => ({ database: 'up' }),
});

describe('GET /api/auth/super-admin-check', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('returns 401 when no Authorization header is present', async () => {
    const res = await request(app).get('/api/auth/super-admin-check');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a visitor token', async () => {
    const res = await request(app)
      .get('/api/auth/super-admin-check')
      .set('Authorization', `Bearer ${visitorToken()}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for an admin token (NOT enough)', async () => {
    const res = await request(app)
      .get('/api/auth/super-admin-check')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(401);
  });

  it('returns 204 No Content for a super_admin token', async () => {
    const res = await request(app)
      .get('/api/auth/super-admin-check')
      .set('Authorization', `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(204);
    // 204 must carry no body — nginx auth_request reads only status.
    expect(res.text).toBe('');
    expect(res.body).toEqual({});
  });

  it('always emits Cache-Control: private, no-store (anonymous 401 path included)', async () => {
    // The header must land BEFORE `isAuthenticated` so the anonymous-401
    // path (which exits via the global error handler, not the route's
    // own res.end()) still carries the no-cache directive.
    const res = await request(app).get('/api/auth/super-admin-check');
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('emits Cache-Control: private, no-store on the super_admin 204 path too', async () => {
    const res = await request(app)
      .get('/api/auth/super-admin-check')
      .set('Authorization', `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(204);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });
});
