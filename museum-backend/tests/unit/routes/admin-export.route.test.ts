import request from 'supertest';
import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { visitorToken, makeToken } from '../../helpers/auth/token.helpers';
import { makeExportSessionRow } from '../../helpers/admin/export.fixtures';

const mockSessions = jest.fn();
const mockReviews = jest.fn();
const mockTickets = jest.fn();

jest.mock('@modules/admin/useCase', () => ({
  listUsersUseCase: { execute: jest.fn() },
  getUserByIdUseCase: { execute: jest.fn() },
  changeUserRoleUseCase: { execute: jest.fn() },
  suspendUserUseCase: { execute: jest.fn() },
  unsuspendUserUseCase: { execute: jest.fn() },
  deleteUserUseCase: { execute: jest.fn() },
  listAuditLogsUseCase: { execute: jest.fn() },
  getStatsUseCase: { execute: jest.fn() },
  listReportsUseCase: { execute: jest.fn() },
  resolveReportUseCase: { execute: jest.fn() },
  getUsageAnalyticsUseCase: { execute: jest.fn() },
  getContentAnalyticsUseCase: { execute: jest.fn() },
  getEngagementAnalyticsUseCase: { execute: jest.fn() },
  adminReviewFacade: { list: jest.fn(), moderateReview: jest.fn() },
  adminSupportFacade: { list: jest.fn(), update: jest.fn() },
  getExportChatSessionsUseCase: () => ({
    execute: (...args: unknown[]) => mockSessions(...args),
  }),
  getExportReviewsUseCase: () => ({
    execute: (...args: unknown[]) => mockReviews(...args),
  }),
  getExportSupportTicketsUseCase: () => ({
    execute: (...args: unknown[]) => mockTickets(...args),
  }),
}));

jest.mock('@modules/admin/useCase/export/composition', () => ({
  getExportChatSessionsUseCase: () => ({
    execute: (...args: unknown[]) => mockSessions(...args),
  }),
  getExportReviewsUseCase: () => ({
    execute: (...args: unknown[]) => mockReviews(...args),
  }),
  getExportSupportTicketsUseCase: () => ({
    execute: (...args: unknown[]) => mockTickets(...args),
  }),
}));

function asyncIterRow() {
  return {
    async *[Symbol.asyncIterator]() {
      yield makeExportSessionRow();
    },
  };
}

const superAdminTok = (museumId: number | null = null) =>
  makeToken({ role: 'super_admin', museumId });
const museumManagerTok = (museumId: number | null = 42) =>
  makeToken({ role: 'museum_manager', museumId });
const adminTok = (museumId: number | null = 7) => makeToken({ role: 'admin', museumId });
const moderatorTok = () => makeToken({ role: 'moderator' });

const { app } = createRouteTestApp();

describe('Admin Export Routes — RBAC + headers (R2)', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    mockSessions.mockReturnValue(asyncIterRow());
    mockReviews.mockReturnValue(asyncIterRow());
    mockTickets.mockReturnValue(asyncIterRow());
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  describe('Unauthenticated', () => {
    it.each(['sessions.csv', 'reviews.csv', 'tickets.csv'])(
      'GET /api/admin/export/%s → 401',
      async (kind) => {
        const res = await request(app).get(`/api/admin/export/${kind}`);
        expect(res.status).toBe(401);
      },
    );
  });

  describe('Visitor / moderator denied (R4 / Q3)', () => {
    it.each(['sessions.csv', 'reviews.csv', 'tickets.csv'])('visitor → 403 on %s', async (kind) => {
      const res = await request(app)
        .get(`/api/admin/export/${kind}`)
        .set('Authorization', `Bearer ${visitorToken()}`);
      expect(res.status).toBe(403);
    });

    it.each(['sessions.csv', 'reviews.csv', 'tickets.csv'])(
      'moderator → 403 on %s (Q3)',
      async (kind) => {
        const res = await request(app)
          .get(`/api/admin/export/${kind}`)
          .set('Authorization', `Bearer ${moderatorTok()}`);
        expect(res.status).toBe(403);
      },
    );
  });

  describe('super_admin happy path', () => {
    it('sessions.csv → 200 + text/csv + BOM + Content-Disposition (R1 / R16 / AC3)', async () => {
      const res = await request(app)
        .get('/api/admin/export/sessions.csv')
        .set('Authorization', `Bearer ${superAdminTok()}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            callback(null, Buffer.concat(chunks));
          });
        });
      expect(res.status).toBe(200);
      const ct = res.headers['content-type'] ?? '';
      expect(ct).toMatch(/^text\/csv;\s*charset=utf-8/i);
      const disp = res.headers['content-disposition'] ?? '';
      expect(disp).toMatch(/attachment;\s*filename="sessions-\d{4}-\d{2}-\d{2}\.csv"/);
      const cache = res.headers['cache-control'] ?? '';
      expect(cache).toMatch(/no-store/);
      const body = res.body as Buffer;
      expect(body[0]).toBe(0xef);
      expect(body[1]).toBe(0xbb);
      expect(body[2]).toBe(0xbf);
    });

    it('reviews.csv → 200 (super_admin is the only role allowed — Q1)', async () => {
      const res = await request(app)
        .get('/api/admin/export/reviews.csv')
        .set('Authorization', `Bearer ${superAdminTok()}`);
      expect(res.status).toBe(200);
      const disp = res.headers['content-disposition'] ?? '';
      expect(disp).toContain('reviews-');
    });

    it('tickets.csv → 200 (super_admin only — Q1)', async () => {
      const res = await request(app)
        .get('/api/admin/export/tickets.csv')
        .set('Authorization', `Bearer ${superAdminTok()}`);
      expect(res.status).toBe(200);
      const disp = res.headers['content-disposition'] ?? '';
      expect(disp).toContain('tickets-');
    });

    it('filename has NO PII — only kind + UTC date (R5 / D9)', async () => {
      const res = await request(app)
        .get('/api/admin/export/sessions.csv')
        .set('Authorization', `Bearer ${superAdminTok()}`);
      const disp = res.headers['content-disposition'] ?? '';
      expect(disp).not.toMatch(/@/);
      expect(disp).toMatch(/filename="sessions-\d{4}-\d{2}-\d{2}\.csv"/);
    });
  });

  describe('museum_manager scope (R6 / Q1 BLOCKER)', () => {
    it('sessions.csv → 200 + use case called with museumScope=42 (R6 / AC4)', async () => {
      const res = await request(app)
        .get('/api/admin/export/sessions.csv')
        .set('Authorization', `Bearer ${museumManagerTok(42)}`);
      expect(res.status).toBe(200);
      expect(mockSessions).toHaveBeenCalledWith(
        expect.objectContaining({
          actorRole: 'museum_manager',
          museumScope: 42,
        }),
      );
    });

    it('reviews.csv → 403 (Q1 BLOCKER)', async () => {
      const res = await request(app)
        .get('/api/admin/export/reviews.csv')
        .set('Authorization', `Bearer ${museumManagerTok(42)}`);
      expect(res.status).toBe(403);
    });

    it('tickets.csv → 403 (Q1 BLOCKER)', async () => {
      const res = await request(app)
        .get('/api/admin/export/tickets.csv')
        .set('Authorization', `Bearer ${museumManagerTok(42)}`);
      expect(res.status).toBe(403);
    });

    it('museum_manager w/ no museumId → 403 NO_MUSEUM_ASSIGNED (R9 / AC6)', async () => {
      const res = await request(app)
        .get('/api/admin/export/sessions.csv')
        .set('Authorization', `Bearer ${museumManagerTok(null)}`);
      expect(res.status).toBe(403);
    });
  });

  describe('admin scope (R8 / Q2)', () => {
    it('sessions.csv → 200 w/ museumScope=user.museumId', async () => {
      const res = await request(app)
        .get('/api/admin/export/sessions.csv')
        .set('Authorization', `Bearer ${adminTok(7)}`);
      expect(res.status).toBe(200);
      expect(mockSessions).toHaveBeenCalledWith(
        expect.objectContaining({ actorRole: 'admin', museumScope: 7 }),
      );
    });

    it('reviews.csv → 403 (Q1 BLOCKER)', async () => {
      const res = await request(app)
        .get('/api/admin/export/reviews.csv')
        .set('Authorization', `Bearer ${adminTok(7)}`);
      expect(res.status).toBe(403);
    });
  });

  it('GET /api/admin/export/foo.csv → 400 or 404', async () => {
    const res = await request(app)
      .get('/api/admin/export/foo.csv')
      .set('Authorization', `Bearer ${superAdminTok()}`);
    expect([400, 404]).toContain(res.status);
  });
});
