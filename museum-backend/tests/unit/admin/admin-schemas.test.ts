import request from 'supertest';

import { adminToken } from '../../helpers/auth/token.helpers';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

/**
 * Query-schema validation tests — Finding M7 / H-2 remediation.
 *
 * Asserts that admin routes previously using `parseInt || default` now go
 * through Zod with:
 *   - `z.enum` rejecting unknown values (granularity, status, priority)
 *   - `z.coerce.number().int().min(1).max(N)` rejecting negative / huge values
 *   - default application when the caller omits a param
 *
 * Use-cases are mocked so handlers run without DB — we only care about the
 * validation layer and that clamped values flow to the use-case call-args.
 */

// ── Mock use cases (same pattern as rbac-matrix.test.ts) ────────────────────

const mockGetUsageAnalytics = jest.fn().mockResolvedValue({});
const mockGetContentAnalytics = jest.fn().mockResolvedValue({});
const mockGetEngagementAnalytics = jest.fn().mockResolvedValue({});
const mockListUsers = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockListAuditLogs = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockListReports = jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
const mockGetStats = jest.fn().mockResolvedValue({});
const mockChangeUserRole = jest.fn().mockResolvedValue({ id: 1 });
const mockResolveReport = jest.fn().mockResolvedValue({ id: 'r1' });

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
  // Admin-side facades wrap peer useCases. admin.route uses these, not the peers directly.
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
const bearer = () => `Bearer ${adminToken()}`;

beforeEach(() => {
  resetRateLimits();
  jest.clearAllMocks();
});

afterAll(() => {
  stopRateLimitSweep();
});

// ── /analytics/usage — granularity enum + date bounds ──────────────────────

describe('GET /api/admin/analytics/usage — Zod validation', () => {
  it('rejects invalid granularity (SQL injection attempt)', async () => {
    const res = await request(app)
      .get("/api/admin/analytics/usage?granularity=day'; DROP TABLE users--")
      .set('Authorization', bearer());
    expect(res.status).toBe(400);
    expect(mockGetUsageAnalytics).not.toHaveBeenCalled();
  });

  it('rejects invalid granularity string (unknown enum value)', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/usage?granularity=hourly')
      .set('Authorization', bearer());
    expect(res.status).toBe(400);
    expect(mockGetUsageAnalytics).not.toHaveBeenCalled();
  });

  it('accepts valid granularity=weekly and forwards it to the use case', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/usage?granularity=weekly')
      .set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(mockGetUsageAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ granularity: 'weekly' }),
    );
  });

  it('applies undefined (repo default) when granularity missing', async () => {
    const res = await request(app).get('/api/admin/analytics/usage').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(mockGetUsageAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ granularity: undefined }),
    );
  });

  it('rejects negative days', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/usage?days=-5')
      .set('Authorization', bearer());
    expect(res.status).toBe(400);
  });

  it('rejects days beyond hard cap (365)', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/usage?days=99999')
      .set('Authorization', bearer());
    expect(res.status).toBe(400);
  });

  it('rejects unparseable from date', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/usage?from=notadate')
      .set('Authorization', bearer());
    expect(res.status).toBe(400);
  });

  it('coerces valid ISO date to string', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/usage?from=2026-01-01&to=2026-02-01')
      .set('Authorization', bearer());
    expect(res.status).toBe(200);
    const call = mockGetUsageAnalytics.mock.calls[0][0] as { from: string; to: string };
    expect(typeof call.from).toBe('string');
    expect(call.from).toContain('2026-01-01');
  });

  it('rejects unknown query keys (strictObject)', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/usage?evil=payload')
      .set('Authorization', bearer());
    expect(res.status).toBe(400);
  });
});

// ── /analytics/content ──────────────────────────────────────────────────────

describe('GET /api/admin/analytics/content — Zod validation', () => {
  it('rejects limit above max (100)', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/content?limit=99999')
      .set('Authorization', bearer());
    expect(res.status).toBe(400);
  });

  it('applies defaults when no query params', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/content')
      .set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(mockGetContentAnalytics).toHaveBeenCalled();
  });
});

// ── /analytics/engagement ───────────────────────────────────────────────────

describe('GET /api/admin/analytics/engagement — Zod validation', () => {
  it('rejects invalid date', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/engagement?to=notadate')
      .set('Authorization', bearer());
    expect(res.status).toBe(400);
  });

  it('passes through when no params', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/engagement')
      .set('Authorization', bearer());
    expect(res.status).toBe(200);
  });
});

// ── /tickets — pagination + enum status/priority ────────────────────────────

describe('GET /api/admin/tickets — Zod validation', () => {
  it('rejects negative page', async () => {
    const res = await request(app).get('/api/admin/tickets?page=-1').set('Authorization', bearer());
    expect(res.status).toBe(400);
  });

  it('rejects limit above max (100)', async () => {
    const res = await request(app)
      .get('/api/admin/tickets?limit=99999')
      .set('Authorization', bearer());
    expect(res.status).toBe(400);
  });

  it('rejects unknown status', async () => {
    const res = await request(app)
      .get('/api/admin/tickets?status=bogus')
      .set('Authorization', bearer());
    expect(res.status).toBe(400);
  });

  it('rejects unknown priority', async () => {
    const res = await request(app)
      .get('/api/admin/tickets?priority=bogus')
      .set('Authorization', bearer());
    expect(res.status).toBe(400);
  });

  it('applies defaults when no query params', async () => {
    const res = await request(app).get('/api/admin/tickets').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(mockListTickets).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
  });

  it('accepts valid enum status', async () => {
    const res = await request(app)
      .get('/api/admin/tickets?status=open&priority=high')
      .set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(mockListTickets).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'open', priority: 'high' }),
    );
  });
});

// ── /reviews — pagination + enum status ─────────────────────────────────────

describe('GET /api/admin/reviews — Zod validation', () => {
  it('rejects negative page', async () => {
    const res = await request(app).get('/api/admin/reviews?page=-1').set('Authorization', bearer());
    expect(res.status).toBe(400);
  });

  it('rejects limit above max (100)', async () => {
    const res = await request(app)
      .get('/api/admin/reviews?limit=99999')
      .set('Authorization', bearer());
    expect(res.status).toBe(400);
  });

  it('rejects unknown status', async () => {
    const res = await request(app)
      .get('/api/admin/reviews?status=bogus')
      .set('Authorization', bearer());
    expect(res.status).toBe(400);
  });

  it('applies defaults when no query params', async () => {
    const res = await request(app).get('/api/admin/reviews').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(mockListReviews).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
  });
});

// ── Defense-in-depth: granularityToTrunc `default: throw` ───────────────────

describe('granularityToTrunc exhaustive default', () => {
  it('throws on unreachable branch (simulating Zod bypass)', async () => {
    const { queryUsageAnalytics } =
      await import('@modules/admin/adapters/secondary/admin-analytics-queries');
    // Pass in a repo bundle that never gets reached; the granularity coercion
    // happens synchronously before any DB call.
    const repos = {
      dataSource: {} as never,
      sessionRepo: {} as never,
      messageRepo: {} as never,
      auditRepo: {} as never,
    };
    await expect(
      queryUsageAnalytics(repos, {
        granularity: 'evil' as unknown as 'daily',
      }),
    ).rejects.toThrow(/unreachable granularity/);
  });
});
