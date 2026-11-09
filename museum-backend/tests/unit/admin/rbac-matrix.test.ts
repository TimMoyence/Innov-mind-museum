import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

import { createAdminKeRouter } from '@modules/admin/adapters/primary/http/routes/admin-ke.route';
import { makeMockArtworkKnowledgeRepo } from '../../helpers/knowledge-extraction/extraction.fixtures';
import { adminToken, makeToken, visitorToken } from '../../helpers/auth/token.helpers';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

const mockListUsers = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockChangeUserRole = jest.fn().mockResolvedValue({ id: 1, role: 'moderator' });
const mockListAuditLogs = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockGetStats = jest.fn().mockResolvedValue({});
const mockListReports = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockResolveReport = jest.fn().mockResolvedValue({ id: 'r1' });
const mockGetUsageAnalytics = jest.fn().mockResolvedValue({});
const mockGetContentAnalytics = jest.fn().mockResolvedValue({});
const mockGetEngagementAnalytics = jest.fn().mockResolvedValue({});
const mockListTickets = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockUpdateTicket = jest.fn().mockResolvedValue({ id: 't1' });
const mockListReviews = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockModerateReview = jest.fn().mockResolvedValue({ id: 'rv1' });

jest.mock('@modules/admin/useCase', () => ({
  listUsersUseCase: { execute: (...a: unknown[]) => mockListUsers(...a) },
  changeUserRoleUseCase: { execute: (...a: unknown[]) => mockChangeUserRole(...a) },
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

jest.mock('@modules/support/useCase', () => ({
  listAllTicketsUseCase: { execute: (...a: unknown[]) => mockListTickets(...a) },
  updateTicketStatusUseCase: { execute: (...a: unknown[]) => mockUpdateTicket(...a) },
}));

jest.mock('@modules/review/useCase', () => ({
  listAllReviewsUseCase: { execute: (...a: unknown[]) => mockListReviews(...a) },
  moderateReviewUseCase: { execute: (...a: unknown[]) => mockModerateReview(...a) },
}));

const { app } = createRouteTestApp();
const moderatorToken = () => makeToken({ role: 'moderator' });
const museumManagerToken = () => makeToken({ role: 'museum_manager', museumId: 42 });

function makeKeApp() {
  const repo = makeMockArtworkKnowledgeRepo({
    findNeedsReview: jest.fn().mockResolvedValue([]),
    approve: jest.fn().mockResolvedValue({ id: 'ak1', title: 't', needsReview: false }),
  });
  const keApp = express();
  keApp.use(express.json());
  keApp.use('/api/admin', createAdminKeRouter(repo));
  const errorHandler = (
    err: { statusCode?: number; message?: string },
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(err.statusCode ?? 500).json({ message: err.message ?? 'Internal error' });
  };
  keApp.use(errorHandler);
  return keApp;
}

type Method = 'get' | 'post' | 'patch';
type RouteKind = 'main' | 'ke';

interface RouteCase {
  label: string;
  method: Method;
  path: string;
  body?: Record<string, unknown>;
  admin: number;
  moderator: number;
  museum_manager: number;
  visitor: number;
  anonymous: number;
  kind: RouteKind;
}

const roleBody = { role: 'moderator' };
const reportBody = { status: 'reviewed' };
const ticketBody = { status: 'in_progress' };
const reviewBody = { status: 'approved' };

const MATRIX: RouteCase[] = [
  {
    label: 'PATCH /users/:id/role',
    method: 'patch',
    path: '/api/admin/users/1/role',
    body: roleBody,
    admin: 200,
    moderator: 403,
    museum_manager: 403,
    visitor: 403,
    anonymous: 401,
    kind: 'main',
  },
  {
    label: 'GET /audit-logs',
    method: 'get',
    path: '/api/admin/audit-logs',
    admin: 200,
    moderator: 403,
    museum_manager: 403,
    visitor: 403,
    anonymous: 401,
    kind: 'main',
  },
  {
    label: 'GET /analytics/usage',
    method: 'get',
    path: '/api/admin/analytics/usage',
    admin: 200,
    moderator: 403,
    museum_manager: 403,
    visitor: 403,
    anonymous: 401,
    kind: 'main',
  },
  {
    label: 'GET /analytics/content',
    method: 'get',
    path: '/api/admin/analytics/content',
    admin: 200,
    moderator: 403,
    museum_manager: 403,
    visitor: 403,
    anonymous: 401,
    kind: 'main',
  },
  {
    label: 'GET /analytics/engagement',
    method: 'get',
    path: '/api/admin/analytics/engagement',
    admin: 200,
    moderator: 403,
    museum_manager: 403,
    visitor: 403,
    anonymous: 401,
    kind: 'main',
  },
  {
    label: 'GET /users',
    method: 'get',
    path: '/api/admin/users',
    admin: 200,
    moderator: 200,
    museum_manager: 403,
    visitor: 403,
    anonymous: 401,
    kind: 'main',
  },
  {
    label: 'GET /stats',
    method: 'get',
    path: '/api/admin/stats',
    admin: 200,
    moderator: 200,
    museum_manager: 200,
    visitor: 403,
    anonymous: 401,
    kind: 'main',
  },
  {
    label: 'GET /reports',
    method: 'get',
    path: '/api/admin/reports',
    admin: 200,
    moderator: 200,
    museum_manager: 403,
    visitor: 403,
    anonymous: 401,
    kind: 'main',
  },
  {
    label: 'PATCH /reports/:id',
    method: 'patch',
    path: '/api/admin/reports/abc',
    body: reportBody,
    admin: 200,
    moderator: 200,
    museum_manager: 403,
    visitor: 403,
    anonymous: 401,
    kind: 'main',
  },
  {
    label: 'GET /tickets',
    method: 'get',
    path: '/api/admin/tickets',
    admin: 200,
    moderator: 200,
    museum_manager: 200,
    visitor: 403,
    anonymous: 401,
    kind: 'main',
  },
  {
    label: 'PATCH /tickets/:id',
    method: 'patch',
    path: '/api/admin/tickets/abc',
    body: ticketBody,
    admin: 200,
    moderator: 200,
    museum_manager: 200,
    visitor: 403,
    anonymous: 401,
    kind: 'main',
  },
  {
    label: 'GET /reviews',
    method: 'get',
    path: '/api/admin/reviews',
    admin: 200,
    moderator: 200,
    museum_manager: 200,
    visitor: 403,
    anonymous: 401,
    kind: 'main',
  },
  {
    label: 'PATCH /reviews/:id',
    method: 'patch',
    path: '/api/admin/reviews/abc',
    body: reviewBody,
    admin: 200,
    moderator: 200,
    museum_manager: 200,
    visitor: 403,
    anonymous: 401,
    kind: 'main',
  },
  {
    label: 'GET /ke/pending',
    method: 'get',
    path: '/api/admin/ke/pending',
    admin: 200,
    moderator: 200,
    museum_manager: 403,
    visitor: 403,
    anonymous: 401,
    kind: 'ke',
  },
  {
    label: 'PATCH /ke/:id/approve',
    method: 'patch',
    path: '/api/admin/ke/ak1/approve',
    admin: 200,
    moderator: 200,
    museum_manager: 403,
    visitor: 403,
    anonymous: 401,
    kind: 'ke',
  },
  {
    label: 'POST /museums/:id/cache/purge',
    method: 'post',
    path: '/api/admin/museums/42/cache/purge',
    admin: 200,
    moderator: 403,
    museum_manager: 403,
    visitor: 403,
    anonymous: 401,
    kind: 'main',
  },
];

const keApp = makeKeApp();

function targetFor(kind: RouteKind) {
  return kind === 'ke' ? keApp : app;
}

function send(
  kind: RouteKind,
  method: Method,
  path: string,
  body: Record<string, unknown> | undefined,
  token?: string,
) {
  const agent = request(targetFor(kind));
  let req;
  switch (method) {
    case 'get':
      req = agent.get(path);
      break;
    case 'post':
      req = agent.post(path);
      break;
    case 'patch':
      req = agent.patch(path);
      break;
  }
  if (token) req.set('Authorization', `Bearer ${token}`);
  if (body) req.send(body);
  return req;
}

describe('Admin RBAC matrix (Finding H3)', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('covers all 16 RBAC-gated admin endpoints (17 finding H3 routes minus duplicate /users role coverage)', () => {
    expect(MATRIX).toHaveLength(16);
  });

  describe.each(MATRIX)('$label', (route) => {
    it(`admin → ${route.admin}`, async () => {
      const res = await send(route.kind, route.method, route.path, route.body, adminToken());
      expect(res.status).toBe(route.admin);
    });

    it(`moderator → ${route.moderator}`, async () => {
      const res = await send(route.kind, route.method, route.path, route.body, moderatorToken());
      expect(res.status).toBe(route.moderator);
    });

    it(`museum_manager → ${route.museum_manager}`, async () => {
      const res = await send(
        route.kind,
        route.method,
        route.path,
        route.body,
        museumManagerToken(),
      );
      expect(res.status).toBe(route.museum_manager);
    });

    it(`visitor → ${route.visitor}`, async () => {
      const res = await send(route.kind, route.method, route.path, route.body, visitorToken());
      expect(res.status).toBe(route.visitor);
    });

    it(`anonymous → ${route.anonymous}`, async () => {
      const res = await send(route.kind, route.method, route.path, route.body);
      expect(res.status).toBe(route.anonymous);
    });
  });
});
