/**
 * T-API-4 (RED — S-BE-API, UFR-022 fresh-context red phase 2026-05-26).
 *
 * RBAC + tenant scoping for the new `GET /api/admin/nps` (R13-R16, Q2).
 * Mirrors the C1 `/api/admin/stats` scoping pattern (`admin.route.ts:246-266`)
 * but DIVERGES on the manager-null case: a `museum_manager` with a NULL
 * `museumId` claim gets 403 (NEVER global) — a BOLA leak otherwise (R16/Q2).
 *
 *   - admin, no param            → global aggregate (use-case gets museumId undefined) (R13)
 *   - admin `?museumId=42`       → museum 42 (R13)
 *   - manager(claim 7) `?museumId=99` → forced to 7, never 99 (R14, adversarial BOLA)
 *   - manager(claim NULL)        → 403 (R16/Q2)
 *   - visitor / anonymous        → 403 / 401 (R15)
 *
 * Baseline FAILS (success of red phase per UFR-022): the route does NOT exist
 * (`admin.route.ts` has no `/nps` handler), so authenticated calls fall through
 * to the 404 handler instead of 200/403 — failure mode = `404` (route absent).
 *
 * `getNpsUseCase` is mocked (DB-free) so the test asserts the SCOPE the route
 * passes, not the SQL. lib-docs/express/PATTERNS.md §3.3 (requireRole gate +
 * validateQuery before handler) + §3.8 (reusable handler arrays).
 */
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

  // ── Auth / role gate (R15) ──────────────────────────────────────
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

  // ── admin: global + per-museum (R13) ────────────────────────────
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

  // ── museum_manager forced scope (R14, BOLA) ─────────────────────
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

  // ── museum_manager NULL claim → 403 (R16/Q2) ────────────────────
  it('manager with NULL museumId claim → 403 (never degrades to global, R16/Q2)', async () => {
    const token = makeToken({ role: 'museum_manager' }); // no museumId claim

    const res = await request(app).get('/api/admin/nps').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    // The aggregate must never run for a NULL-claim manager (no cross-tenant leak).
    expect(mockGetNps).not.toHaveBeenCalled();
  });
});
