/**
 * R1 RED — PATCH /api/admin/users/:id/tier route (T1.4).
 *
 * Pins R1 §1 R14/R15/R16 + AC5/AC6 down BEFORE implementation :
 *  - super_admin JWT → 200 + `{ user: <updated AdminUserDTO with tier> }`.
 *  - admin JWT → 403 (R15 — super_admin-only override per spec brief).
 *  - museum_manager JWT → 403.
 *  - visitor JWT → 403.
 *  - no JWT → 401.
 *  - invalid tier body (`{tier:'enterprise'}` or empty) → 400 (R16, zod).
 *  - non-numeric :id → 400 (mirror role route shape).
 *
 * MUST FAIL at baseline `cd7e22bc` — the route is not registered on
 * `adminRouter` yet; the `changeUserTierUseCase` barrel export does not exist.
 */
import request from 'supertest';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import {
  adminToken,
  visitorToken,
  superAdminToken,
  makeToken,
} from '../../helpers/auth/token.helpers';

// Mocks for every admin use case the router composes today + the new R1 one.
// We re-declare the full barrel so the green agent can append
// `changeUserTierUseCase` without forcing other admin route tests to update.
const mockListUsers = jest.fn();
const mockChangeUserRole = jest.fn();
const mockChangeUserTier = jest.fn();
const mockListAuditLogs = jest.fn();
const mockGetStats = jest.fn();
const mockListReports = jest.fn();
const mockResolveReport = jest.fn();
const mockGetUsageAnalytics = jest.fn();
const mockGetContentAnalytics = jest.fn();
const mockGetEngagementAnalytics = jest.fn();
const mockListAllTickets = jest.fn();
const mockUpdateTicketStatus = jest.fn();
const mockListAllReviews = jest.fn();
const mockModerateReview = jest.fn();
const mockSuspendUser = jest.fn();
const mockUnsuspendUser = jest.fn();
const mockDeleteUser = jest.fn();
const mockGetUserById = jest.fn();

jest.mock('@modules/admin/useCase', () => ({
  listUsersUseCase: { execute: (...args: unknown[]) => mockListUsers(...args) },
  changeUserRoleUseCase: { execute: (...args: unknown[]) => mockChangeUserRole(...args) },
  // R1 §0.3 — new composition root export.
  changeUserTierUseCase: { execute: (...args: unknown[]) => mockChangeUserTier(...args) },
  listAuditLogsUseCase: { execute: (...args: unknown[]) => mockListAuditLogs(...args) },
  getStatsUseCase: { execute: (...args: unknown[]) => mockGetStats(...args) },
  listReportsUseCase: { execute: (...args: unknown[]) => mockListReports(...args) },
  resolveReportUseCase: { execute: (...args: unknown[]) => mockResolveReport(...args) },
  getUsageAnalyticsUseCase: { execute: (...args: unknown[]) => mockGetUsageAnalytics(...args) },
  getContentAnalyticsUseCase: {
    execute: (...args: unknown[]) => mockGetContentAnalytics(...args),
  },
  getEngagementAnalyticsUseCase: {
    execute: (...args: unknown[]) => mockGetEngagementAnalytics(...args),
  },
  suspendUserUseCase: { execute: (...args: unknown[]) => mockSuspendUser(...args) },
  unsuspendUserUseCase: { execute: (...args: unknown[]) => mockUnsuspendUser(...args) },
  deleteUserUseCase: { execute: (...args: unknown[]) => mockDeleteUser(...args) },
  getUserByIdUseCase: { execute: (...args: unknown[]) => mockGetUserById(...args) },
  adminReviewFacade: {
    list: (...args: unknown[]) => mockListAllReviews(...args),
    moderateReview: (...args: unknown[]) => mockModerateReview(...args),
  },
  adminSupportFacade: {
    list: (...args: unknown[]) => mockListAllTickets(...args),
    update: (...args: unknown[]) => mockUpdateTicketStatus(...args),
  },
}));

jest.mock('@modules/support/useCase', () => ({
  listAllTicketsUseCase: { execute: (...args: unknown[]) => mockListAllTickets(...args) },
  updateTicketStatusUseCase: { execute: (...args: unknown[]) => mockUpdateTicketStatus(...args) },
}));

jest.mock('@modules/review/useCase', () => ({
  listAllReviewsUseCase: { execute: (...args: unknown[]) => mockListAllReviews(...args) },
  moderateReviewUseCase: { execute: (...args: unknown[]) => mockModerateReview(...args) },
}));

const { app } = createRouteTestApp();

describe('PATCH /api/admin/users/:id/tier — RBAC + validation (R1 §1 R14-R16)', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // ── Auth gates ───────────────────────────────────────────────────────

  it('unauthenticated → 401', async () => {
    const res = await request(app).patch('/api/admin/users/1/tier').send({ tier: 'premium' });
    expect(res.status).toBe(401);
    expect(mockChangeUserTier).not.toHaveBeenCalled();
  });

  it('visitor → 403 (R15 — super_admin-only)', async () => {
    const res = await request(app)
      .patch('/api/admin/users/1/tier')
      .set('Authorization', `Bearer ${visitorToken()}`)
      .send({ tier: 'premium' });
    expect(res.status).toBe(403);
    expect(mockChangeUserTier).not.toHaveBeenCalled();
  });

  it('admin → 403 (R15 — admin role NOT enough, super_admin-only override)', async () => {
    const res = await request(app)
      .patch('/api/admin/users/1/tier')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ tier: 'premium' });
    expect(res.status).toBe(403);
    expect(mockChangeUserTier).not.toHaveBeenCalled();
  });

  it('museum_manager → 403', async () => {
    const res = await request(app)
      .patch('/api/admin/users/1/tier')
      .set('Authorization', `Bearer ${makeToken({ role: 'museum_manager' })}`)
      .send({ tier: 'premium' });
    expect(res.status).toBe(403);
    expect(mockChangeUserTier).not.toHaveBeenCalled();
  });

  it('moderator → 403', async () => {
    const res = await request(app)
      .patch('/api/admin/users/1/tier')
      .set('Authorization', `Bearer ${makeToken({ role: 'moderator' })}`)
      .send({ tier: 'premium' });
    expect(res.status).toBe(403);
    expect(mockChangeUserTier).not.toHaveBeenCalled();
  });

  // ── Happy path (super_admin) ─────────────────────────────────────────

  it('R14: super_admin → 200 + updated DTO with tier field', async () => {
    const updated = {
      id: 2,
      email: 'b@test.com',
      role: 'visitor',
      tier: 'premium',
      museumId: null,
      emailVerified: true,
      suspended: false,
      deletedAt: null,
      firstname: null,
      lastname: null,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    mockChangeUserTier.mockResolvedValueOnce(updated);

    const res = await request(app)
      .patch('/api/admin/users/2/tier')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ tier: 'premium' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: updated });
    expect(mockChangeUserTier).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2, newTier: 'premium' }),
    );
  });

  it('R14: super_admin demoting premium → free → 200', async () => {
    const updated = { id: 3, email: 'c@test.com', role: 'visitor', tier: 'free' };
    mockChangeUserTier.mockResolvedValueOnce(updated);
    const res = await request(app)
      .patch('/api/admin/users/3/tier')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ tier: 'free' });
    expect(res.status).toBe(200);
    expect(mockChangeUserTier).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 3, newTier: 'free' }),
    );
  });

  // ── Validation ───────────────────────────────────────────────────────

  it('R16: invalid tier body ({tier:"enterprise"}) → 400', async () => {
    const res = await request(app)
      .patch('/api/admin/users/2/tier')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ tier: 'enterprise' });
    expect(res.status).toBe(400);
    expect(mockChangeUserTier).not.toHaveBeenCalled();
  });

  it('R16: empty body → 400', async () => {
    const res = await request(app)
      .patch('/api/admin/users/2/tier')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(mockChangeUserTier).not.toHaveBeenCalled();
  });

  it('non-numeric :id → 400 (mirror role route shape)', async () => {
    const res = await request(app)
      .patch('/api/admin/users/abc/tier')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ tier: 'premium' });
    expect(res.status).toBe(400);
    expect(mockChangeUserTier).not.toHaveBeenCalled();
  });
});
