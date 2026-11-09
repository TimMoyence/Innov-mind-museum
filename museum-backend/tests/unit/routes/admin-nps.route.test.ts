import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { adminToken, visitorToken, makeToken } from '../../helpers/auth/token.helpers';

const mockGetNps = jest.fn();

jest.mock('@modules/review/useCase', () => {
  const actual = jest.requireActual('@modules/review/useCase');
  return {
    ...actual,
    getNpsUseCase: { execute: (...args: unknown[]) => mockGetNps(...args) },
  };
});

const NPS_PAYLOAD = { nps: 40, promoters: 4, passives: 4, detractors: 2, count: 10 };

const { app } = createRouteTestApp();

describe('GET /api/admin/nps — RBAC + tenant scope (S-BE-API / T-API-4)', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    mockGetNps.mockResolvedValue(NPS_PAYLOAD);
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('returns 401 for anonymous (no token)', async () => {
    const res = await request(app).get('/api/admin/nps');
    expect(res.status).toBe(401);
  });

  it('returns 403 for a visitor token (R15)', async () => {
    const res = await request(app)
      .get('/api/admin/nps')
      .set('Authorization', `Bearer ${visitorToken()}`);
    expect(res.status).toBe(403);
  });

  it('admin with no museumId → global aggregate (use-case museumId undefined)', async () => {
    const res = await request(app)
      .get('/api/admin/nps')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(NPS_PAYLOAD);
    expect(mockGetNps).toHaveBeenCalledTimes(1);
    const arg = mockGetNps.mock.calls[0]?.[0] as { museumId?: number } | undefined;
    expect(arg?.museumId).toBeUndefined();
  });

  it('admin with ?museumId=42 → scopes to museum 42 (R13)', async () => {
    const res = await request(app)
      .get('/api/admin/nps?museumId=42')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    const arg = mockGetNps.mock.calls[0]?.[0] as { museumId?: number } | undefined;
    expect(arg?.museumId).toBe(42);
  });

  it('manager (claim museumId=7) with ?museumId=99 → forced to 7, NEVER 99 (R14 BOLA)', async () => {
    const token = makeToken({ role: 'museum_manager', museumId: 7 });

    const res = await request(app)
      .get('/api/admin/nps?museumId=99')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const arg = mockGetNps.mock.calls[0]?.[0] as { museumId?: number } | undefined;
    expect(arg?.museumId).toBe(7);
    expect(arg?.museumId).not.toBe(99);
  });

  it('manager with NULL museumId claim → 403 (never degrades to global, R16/Q2)', async () => {
    const token = makeToken({ role: 'museum_manager' });

    const res = await request(app).get('/api/admin/nps').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(mockGetNps).not.toHaveBeenCalled();
  });
});
