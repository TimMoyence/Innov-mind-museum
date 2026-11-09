import request from 'supertest';

import { makeToken } from '../../helpers/auth/token.helpers';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

const mockGetStats = jest.fn();
const mockListUsers = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockChangeUserRole = jest.fn().mockResolvedValue({ id: 1 });
const mockListAuditLogs = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockListReports = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockResolveReport = jest.fn().mockResolvedValue({ id: 'r1' });
const mockGetUsageAnalytics = jest.fn().mockResolvedValue({});
const mockGetContentAnalytics = jest.fn().mockResolvedValue({});
const mockGetEngagementAnalytics = jest.fn().mockResolvedValue({});
const mockListTickets = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockUpdateTicket = jest.fn().mockResolvedValue({ id: 't1' });
const mockListReviews = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockModerateReview = jest.fn().mockResolvedValue({ id: 'rv1' });
const mockGetUserById = jest.fn().mockResolvedValue({ id: 1 });
const mockChangeUserTier = jest.fn().mockResolvedValue({ id: 1 });
const mockSuspendUser = jest.fn().mockResolvedValue({ id: 1 });
const mockUnsuspendUser = jest.fn().mockResolvedValue({ id: 1 });
const mockDeleteUser = jest.fn().mockResolvedValue({ id: 1 });

jest.mock('@modules/admin/useCase', () => ({
  listUsersUseCase: { execute: (...a: unknown[]) => mockListUsers(...a) },
  getUserByIdUseCase: { execute: (...a: unknown[]) => mockGetUserById(...a) },
  changeUserRoleUseCase: { execute: (...a: unknown[]) => mockChangeUserRole(...a) },
  changeUserTierUseCase: { execute: (...a: unknown[]) => mockChangeUserTier(...a) },
  suspendUserUseCase: { execute: (...a: unknown[]) => mockSuspendUser(...a) },
  unsuspendUserUseCase: { execute: (...a: unknown[]) => mockUnsuspendUser(...a) },
  deleteUserUseCase: { execute: (...a: unknown[]) => mockDeleteUser(...a) },
  listAuditLogsUseCase: { execute: (...a: unknown[]) => mockListAuditLogs(...a) },
  getStatsUseCase: { execute: (...a: unknown[]) => mockGetStats(...a) },
  listReportsUseCase: { execute: (...a: unknown[]) => mockListReports(...a) },
  resolveReportUseCase: { execute: (...a: unknown[]) => mockResolveReport(...a) },
  getUsageAnalyticsUseCase: { execute: (...a: unknown[]) => mockGetUsageAnalytics(...a) },
  getContentAnalyticsUseCase: { execute: (...a: unknown[]) => mockGetContentAnalytics(...a) },
  getEngagementAnalyticsUseCase: { execute: (...a: unknown[]) => mockGetEngagementAnalytics(...a) },
  adminReviewFacade: {
    list: (...a: unknown[]) => mockListReviews(...a),
    moderateReview: (...a: unknown[]) => mockModerateReview(...a),
  },
  adminSupportFacade: {
    list: (...a: unknown[]) => mockListTickets(...a),
    update: (...a: unknown[]) => mockUpdateTicket(...a),
  },
}));

const { app } = createRouteTestApp();

const bearerSuperAdmin = (): string => `Bearer ${makeToken({ role: 'super_admin' })}`;
const bearerMuseumManager = (museumId: number): string =>
  `Bearer ${makeToken({ role: 'museum_manager', museumId })}`;

beforeEach(() => {
  resetRateLimits();
  jest.clearAllMocks();
  mockGetStats.mockResolvedValue({ totalUsers: 0, totalReviews: 0 });
});

afterAll(() => {
  stopRateLimitSweep();
});

describe('GET /api/admin/stats — museumId scope + BOLA guard (T-B5 — R-C8 / OWASP API3)', () => {
  it('(a) museum_manager(42) ?museumId=42 → 200 + use case called with { museumId: 42 }', async () => {
    const res = await request(app)
      .get('/api/admin/stats?museumId=42')
      .set('Authorization', bearerMuseumManager(42));

    expect(res.status).toBe(200);
    expect(mockGetStats).toHaveBeenCalledTimes(1);
    expect(mockGetStats).toHaveBeenCalledWith(expect.objectContaining({ museumId: 42 }));
  });

  it('(b) museum_manager(42) ?museumId=99 → 403 OR forced-scope (BOLA — no cross-tenant read)', async () => {
    const res = await request(app)
      .get('/api/admin/stats?museumId=99')
      .set('Authorization', bearerMuseumManager(42));

    const got403 = res.status === 403;
    const got200WithForcedScope =
      res.status === 200 &&
      mockGetStats.mock.calls.some(
        (call) => (call[0] as { museumId?: number } | undefined)?.museumId === 42,
      );
    expect(got403 || got200WithForcedScope).toBe(true);

    const calledWithCrossTenant = mockGetStats.mock.calls.some(
      (call) => (call[0] as { museumId?: number } | undefined)?.museumId === 99,
    );
    expect(calledWithCrossTenant).toBe(false);
  });

  it('(c) super_admin without museumId → 200 + cross-tenant view (use case called with no museumId)', async () => {
    const res = await request(app).get('/api/admin/stats').set('Authorization', bearerSuperAdmin());

    expect(res.status).toBe(200);
    expect(mockGetStats).toHaveBeenCalledTimes(1);
    const firstArg = mockGetStats.mock.calls[0]?.[0] as { museumId?: number } | undefined;
    const noMuseumId = firstArg === undefined || firstArg.museumId === undefined;
    expect(noMuseumId).toBe(true);
  });

  it('(d) z.strictObject rejects unknown query params (e.g. ?museumId=42&foo=bar → 400)', async () => {
    const res = await request(app)
      .get('/api/admin/stats?museumId=42&foo=bar')
      .set('Authorization', bearerSuperAdmin());

    expect(res.status).toBe(400);
  });
});
