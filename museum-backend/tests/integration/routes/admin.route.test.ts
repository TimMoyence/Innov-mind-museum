import request from 'supertest';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { adminToken, visitorToken, makeToken } from '../../helpers/auth/token.helpers';

// ── Mock use cases so handlers execute without DB ────────────────────

const mockListUsers = jest.fn();
const mockChangeUserRole = jest.fn();
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

jest.mock('@modules/admin/useCase', () => ({
  listUsersUseCase: { execute: (...args: unknown[]) => mockListUsers(...args) },
  changeUserRoleUseCase: { execute: (...args: unknown[]) => mockChangeUserRole(...args) },
  listAuditLogsUseCase: { execute: (...args: unknown[]) => mockListAuditLogs(...args) },
  getStatsUseCase: { execute: (...args: unknown[]) => mockGetStats(...args) },
  listReportsUseCase: { execute: (...args: unknown[]) => mockListReports(...args) },
  resolveReportUseCase: { execute: (...args: unknown[]) => mockResolveReport(...args) },
  getUsageAnalyticsUseCase: { execute: (...args: unknown[]) => mockGetUsageAnalytics(...args) },
  getContentAnalyticsUseCase: { execute: (...args: unknown[]) => mockGetContentAnalytics(...args) },
  getEngagementAnalyticsUseCase: {
    execute: (...args: unknown[]) => mockGetEngagementAnalytics(...args),
  },
  // Admin-side facades wrap peer useCases. admin.route uses these, not the peers directly.
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

/**
 * Admin route integration tests — RBAC enforcement + validation + happy-path handler bodies.
 * No DB required — use cases are mocked.
 */

const { app } = createRouteTestApp();

describe('Admin Routes — RBAC Enforcement', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  describe('Unauthenticated access returns 401', () => {
    it('GET /api/admin/users', async () => {
      const res = await request(app).get('/api/admin/users');
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/audit-logs', async () => {
      const res = await request(app).get('/api/admin/audit-logs');
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/stats', async () => {
      const res = await request(app).get('/api/admin/stats');
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/reports', async () => {
      const res = await request(app).get('/api/admin/reports');
      expect(res.status).toBe(401);
    });

    it('PATCH /api/admin/users/1/role', async () => {
      const res = await request(app).patch('/api/admin/users/1/role').send({ role: 'admin' });
      expect(res.status).toBe(401);
    });

    it('PATCH /api/admin/reports/1', async () => {
      const res = await request(app).patch('/api/admin/reports/1').send({ status: 'reviewed' });
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/analytics/usage', async () => {
      const res = await request(app).get('/api/admin/analytics/usage');
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/analytics/content', async () => {
      const res = await request(app).get('/api/admin/analytics/content');
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/analytics/engagement', async () => {
      const res = await request(app).get('/api/admin/analytics/engagement');
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/tickets', async () => {
      const res = await request(app).get('/api/admin/tickets');
      expect(res.status).toBe(401);
    });

    it('PATCH /api/admin/tickets/1', async () => {
      const res = await request(app).patch('/api/admin/tickets/1').send({ status: 'resolved' });
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/reviews', async () => {
      const res = await request(app).get('/api/admin/reviews');
      expect(res.status).toBe(401);
    });

    it('PATCH /api/admin/reviews/1', async () => {
      const res = await request(app).patch('/api/admin/reviews/1').send({ status: 'approved' });
      expect(res.status).toBe(401);
    });
  });

  // ── Visitor role (non-admin) gets 403 ─────────────────────────────

  describe('Visitor role returns 403 on admin-only routes', () => {
    it('GET /api/admin/users returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('PATCH /api/admin/users/1/role returns 403 for visitor', async () => {
      const res = await request(app)
        .patch('/api/admin/users/1/role')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ role: 'admin' });
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/audit-logs returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/stats returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/reports returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/reports')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('PATCH /api/admin/reports/1 returns 403 for visitor', async () => {
      const res = await request(app)
        .patch('/api/admin/reports/1')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ status: 'reviewed' });
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/analytics/usage returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/usage')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/analytics/content returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/content')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/analytics/engagement returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/engagement')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/tickets returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/tickets')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('PATCH /api/admin/tickets/1 returns 403 for visitor', async () => {
      const res = await request(app)
        .patch('/api/admin/tickets/1')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ status: 'resolved' });
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/reviews returns 403 for visitor', async () => {
      const res = await request(app)
        .get('/api/admin/reviews')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it('PATCH /api/admin/reviews/1 returns 403 for visitor', async () => {
      const res = await request(app)
        .patch('/api/admin/reviews/1')
        .set('Authorization', `Bearer ${visitorToken()}`)
        .send({ status: 'approved' });
      expect(res.status).toBe(403);
    });
  });

  // ── Body validation with admin token ──────────────────────────────

  describe('Body validation on admin routes (with admin token)', () => {
    it('PATCH /api/admin/users/1/role returns 400 for invalid role value', async () => {
      const res = await request(app)
        .patch('/api/admin/users/1/role')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ role: 'superuser' });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/admin/users/1/role returns 400 for empty body', async () => {
      const res = await request(app)
        .patch('/api/admin/users/1/role')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('PATCH /api/admin/reports/1 returns 400 for invalid status', async () => {
      const res = await request(app)
        .patch('/api/admin/reports/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'invalid-status' });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/admin/reports/1 returns 400 for empty body', async () => {
      const res = await request(app)
        .patch('/api/admin/reports/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('PATCH /api/admin/tickets/1 returns 400 for invalid status', async () => {
      const res = await request(app)
        .patch('/api/admin/tickets/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'nonexistent' });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/admin/tickets/1 returns 400 for invalid priority', async () => {
      const res = await request(app)
        .patch('/api/admin/tickets/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ priority: 'critical' });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/admin/reviews/1 returns 400 for invalid status', async () => {
      const res = await request(app)
        .patch('/api/admin/reviews/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'pending' });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/admin/reviews/1 returns 400 for empty body', async () => {
      const res = await request(app)
        .patch('/api/admin/reviews/1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  // ── Error response format ─────────────────────────────────────────

  describe('Error response format', () => {
    it('403 returns structured JSON with error field', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'FORBIDDEN');
    });
  });

  // ── Happy-path handler body coverage ─────────────────────────────

  describe('Happy-path — handler bodies with admin token', () => {
    it('GET /api/admin/users returns paginated user list', async () => {
      const mockResult = {
        data: [{ id: 1, email: 'a@test.com', role: 'visitor' }],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockListUsers.mockResolvedValueOnce(mockResult);

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
      expect(mockListUsers).toHaveBeenCalledWith(
        expect.objectContaining({ pagination: { page: 1, limit: 20 } }),
      );
    });

    it('GET /api/admin/users passes search and role params', async () => {
      mockListUsers.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });

      await request(app)
        .get('/api/admin/users?search=john&role=admin')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(mockListUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'john', role: 'admin' }),
      );
    });

    it('PATCH /api/admin/users/:id/role changes user role', async () => {
      const updatedUser = { id: 2, email: 'b@test.com', role: 'moderator' };
      mockChangeUserRole.mockResolvedValueOnce(updatedUser);

      const res = await request(app)
        .patch('/api/admin/users/2/role')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ role: 'moderator' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ user: updatedUser });
      expect(mockChangeUserRole).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 2, newRole: 'moderator' }),
      );
    });

    it('PATCH /api/admin/users/abc/role returns 400 for non-numeric ID', async () => {
      const res = await request(app)
        .patch('/api/admin/users/abc/role')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ role: 'moderator' });

      expect(res.status).toBe(400);
      expect(mockChangeUserRole).not.toHaveBeenCalled();
    });

    it('GET /api/admin/audit-logs returns paginated audit logs', async () => {
      const mockResult = {
        data: [{ id: 'log-1', action: 'ROLE_CHANGE', createdAt: '2026-01-01' }],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockListAuditLogs.mockResolvedValueOnce(mockResult);

      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
    });

    it('GET /api/admin/stats returns dashboard stats', async () => {
      const mockStats = { users: 100, sessions: 500, messages: 3000 };
      mockGetStats.mockResolvedValueOnce(mockStats);

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockStats);
    });

    it('GET /api/admin/reports returns paginated reports', async () => {
      const mockResult = {
        data: [{ id: 'rpt-1', status: 'pending', reason: 'offensive' }],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockListReports.mockResolvedValueOnce(mockResult);

      const res = await request(app)
        .get('/api/admin/reports')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
    });

    it('PATCH /api/admin/reports/:id resolves a report', async () => {
      const resolved = { id: 'rpt-1', status: 'reviewed', reviewerNotes: 'OK' };
      mockResolveReport.mockResolvedValueOnce(resolved);

      const res = await request(app)
        .patch('/api/admin/reports/rpt-1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'reviewed', reviewerNotes: 'OK' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ report: resolved });
      expect(mockResolveReport).toHaveBeenCalledWith(
        expect.objectContaining({ reportId: 'rpt-1', status: 'reviewed', reviewerNotes: 'OK' }),
      );
    });

    it('GET /api/admin/analytics/usage returns usage time series', async () => {
      const mockUsage = { timeSeries: [{ date: '2026-01-01', count: 10 }] };
      mockGetUsageAnalytics.mockResolvedValueOnce(mockUsage);

      const res = await request(app)
        .get('/api/admin/analytics/usage')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockUsage);
    });

    it('GET /api/admin/analytics/usage passes granularity param', async () => {
      mockGetUsageAnalytics.mockResolvedValueOnce({ timeSeries: [] });

      await request(app)
        .get('/api/admin/analytics/usage?granularity=daily')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(mockGetUsageAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({ granularity: 'daily' }),
      );
    });

    it('GET /api/admin/analytics/content returns top artworks/museums', async () => {
      const mockContent = { topArtworks: [{ title: 'Mona Lisa', views: 500 }] };
      mockGetContentAnalytics.mockResolvedValueOnce(mockContent);

      const res = await request(app)
        .get('/api/admin/analytics/content')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockContent);
    });

    it('GET /api/admin/analytics/engagement returns engagement metrics', async () => {
      const mockEngagement = { avgSessionDuration: 120, avgMessages: 5 };
      mockGetEngagementAnalytics.mockResolvedValueOnce(mockEngagement);

      const res = await request(app)
        .get('/api/admin/analytics/engagement')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockEngagement);
    });

    it('GET /api/admin/tickets returns paginated ticket list', async () => {
      const mockResult = {
        data: [{ id: 'tkt-1', status: 'open', subject: 'Help' }],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockListAllTickets.mockResolvedValueOnce(mockResult);

      const res = await request(app)
        .get('/api/admin/tickets')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
    });

    it('PATCH /api/admin/tickets/:id updates ticket', async () => {
      const updatedTicket = { id: 'tkt-1', status: 'resolved' };
      mockUpdateTicketStatus.mockResolvedValueOnce(updatedTicket);

      const res = await request(app)
        .patch('/api/admin/tickets/tkt-1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ticket: updatedTicket });
    });

    it('GET /api/admin/reviews returns paginated review list', async () => {
      const mockResult = {
        data: [{ id: 'rev-1', status: 'pending', rating: 4 }],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockListAllReviews.mockResolvedValueOnce(mockResult);

      const res = await request(app)
        .get('/api/admin/reviews')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
    });

    it('PATCH /api/admin/reviews/:id moderates a review', async () => {
      const moderated = { id: 'rev-1', status: 'approved' };
      mockModerateReview.mockResolvedValueOnce(moderated);

      const res = await request(app)
        .patch('/api/admin/reviews/rev-1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ review: moderated });
    });

    // RBAC tightening (Sprint 1 H3): moderator is now denied on admin-only endpoints
    // (users, users/:id/role, audit-logs, analytics/*, museums/:id/cache/purge).
    // Moderator retains access to moderation endpoints (stats, reports, tickets,
    // reviews, ke/pending, ke/:id/approve). See docs/rbac-matrix.md + rbac-matrix.test.ts.
    describe('moderator token — RBAC scope (tightened in Sprint 1)', () => {
      it('gets 403 on admin-only GET /users', async () => {
        const modToken = makeToken({ role: 'moderator' });

        const res = await request(app)
          .get('/api/admin/users')
          .set('Authorization', `Bearer ${modToken}`);

        expect(res.status).toBe(403);
        expect(mockListUsers).not.toHaveBeenCalled();
      });

      it('can access admin+moderator GET /stats', async () => {
        const modToken = makeToken({ role: 'moderator' });
        mockGetStats.mockResolvedValueOnce({ users: 1, sessions: 1, messages: 1 });

        const res = await request(app)
          .get('/api/admin/stats')
          .set('Authorization', `Bearer ${modToken}`);

        expect(res.status).toBe(200);
        expect(mockGetStats).toHaveBeenCalledTimes(1);
      });
    });

    it('use case error is forwarded as 500', async () => {
      mockGetStats.mockRejectedValueOnce(new Error('DB down'));

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(500);
    });
  });
});
