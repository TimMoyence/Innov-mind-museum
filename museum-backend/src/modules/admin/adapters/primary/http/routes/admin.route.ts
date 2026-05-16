import { type Request, type Response, Router } from 'express';

import {
  changeUserRoleSchema,
  changeUserTierSchema,
  resolveReportSchema,
  updateTicketSchema,
  listUsersQuerySchema,
  auditLogsQuerySchema,
  listReportsQuerySchema,
  usageAnalyticsQuerySchema,
  contentAnalyticsQuerySchema,
  engagementAnalyticsQuerySchema,
  listTicketsQuerySchema,
  listReviewsQuerySchema,
  type UsageAnalyticsQuery,
  type ContentAnalyticsQuery,
  type EngagementAnalyticsQuery,
  type ListTicketsQuery,
  type ListReviewsQuery,
} from '@modules/admin/adapters/primary/http/schemas/admin.schemas';
import {
  listUsersUseCase,
  getUserByIdUseCase,
  changeUserRoleUseCase,
  changeUserTierUseCase,
  suspendUserUseCase,
  unsuspendUserUseCase,
  deleteUserUseCase,
  listAuditLogsUseCase,
  getStatsUseCase,
  listReportsUseCase,
  resolveReportUseCase,
  getUsageAnalyticsUseCase,
  getContentAnalyticsUseCase,
  getEngagementAnalyticsUseCase,
  adminReviewFacade,
  adminSupportFacade,
} from '@modules/admin/useCase';
import { moderateReviewSchema } from '@modules/review/adapters/primary/http/schemas/review.schemas';
import { badRequest } from '@shared/errors/app.error';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import { requireRole } from '@shared/middleware/require-role.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';
import { validateQuery } from '@shared/middleware/validate-query.middleware';

const adminRouter: Router = Router();

function parseUserIdParam(req: Request): number {
  const raw = parseStringParam(req, 'id');
  if (!raw) throw badRequest('Invalid user ID');
  const userId = Number.parseInt(raw, 10);
  if (Number.isNaN(userId)) throw badRequest('Invalid user ID');
  return userId;
}

// GET /api/admin/users — Admin & moderator: paginated user list
// Moderators need user lookup for ticket assignment / report triage.
// Role mutation (PATCH /:id/role) remains admin-only below.
adminRouter.get(
  '/users',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  validateQuery(listUsersQuerySchema),
  async (_req: Request, res: Response) => {
    const { page, limit, search, role } = res.locals.validatedQuery as {
      page: number;
      limit: number;
      search?: string;
      role?: string;
    };

    const result = await listUsersUseCase.execute({
      search,
      role,
      pagination: { page, limit },
    });

    res.json(result);
  },
);

// GET /api/admin/users/:id — Admin & moderator: single user detail (incl. soft-deleted)
// Moderators read user detail for ticket triage; admin & super_admin for full ops.
adminRouter.get(
  '/users/:id',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  async (req: Request, res: Response) => {
    const userId = parseUserIdParam(req);

    const user = await getUserByIdUseCase.execute({ userId });

    res.json({ user });
  },
);

// PATCH /api/admin/users/:id/role — Admin only: change user role
adminRouter.patch(
  '/users/:id/role',
  isAuthenticated,
  requireRole('admin'),
  validateBody(changeUserRoleSchema),
  async (req: Request, res: Response) => {
    const userId = parseUserIdParam(req);

    const { role } = req.body as { role: string };

    const updated = await changeUserRoleUseCase.execute({
      userId,
      newRole: role,
      actorId: req.user?.id ?? 0,
      ip: req.ip,
      requestId: req.requestId,
    });

    res.json({ user: updated });
  },
);

// PATCH /api/admin/users/:id/tier — super_admin only: flip soft-paywall tier
// (R1 §1 R14-R16). `admin` and `museum_manager` are NOT allowed (per spec
// brief — see R1 §0.3) ; super_admin override only.
adminRouter.patch(
  '/users/:id/tier',
  isAuthenticated,
  requireRole('super_admin'),
  validateBody(changeUserTierSchema),
  async (req: Request, res: Response) => {
    const userId = parseUserIdParam(req);

    const { tier } = req.body as { tier: 'free' | 'premium' };

    const updated = await changeUserTierUseCase.execute({
      userId,
      newTier: tier,
      actorId: req.user?.id ?? 0,
      ip: req.ip,
      requestId: req.requestId,
    });

    res.json({ user: updated });
  },
);

// POST /api/admin/users/:id/suspend — super_admin only: freeze a user account.
// Reserved to super_admin so a rogue B2B admin cannot freeze a tenant peer.
adminRouter.post(
  '/users/:id/suspend',
  isAuthenticated,
  requireRole('super_admin'),
  async (req: Request, res: Response) => {
    const userId = parseUserIdParam(req);

    const updated = await suspendUserUseCase.execute({
      userId,
      actorId: req.user?.id ?? 0,
      ip: req.ip,
      requestId: req.requestId,
    });

    res.json({ user: updated });
  },
);

// POST /api/admin/users/:id/unsuspend — super_admin only: lift the freeze.
adminRouter.post(
  '/users/:id/unsuspend',
  isAuthenticated,
  requireRole('super_admin'),
  async (req: Request, res: Response) => {
    const userId = parseUserIdParam(req);

    const updated = await unsuspendUserUseCase.execute({
      userId,
      actorId: req.user?.id ?? 0,
      ip: req.ip,
      requestId: req.requestId,
    });

    res.json({ user: updated });
  },
);

// DELETE /api/admin/users/:id — super_admin only: soft-delete a user account.
// Hard erasure (RGPD Art. 17 full erase) is deferred to V1.1 (ADR-052).
adminRouter.delete(
  '/users/:id',
  isAuthenticated,
  requireRole('super_admin'),
  async (req: Request, res: Response) => {
    const userId = parseUserIdParam(req);

    const deleted = await deleteUserUseCase.execute({
      userId,
      actorId: req.user?.id ?? 0,
      ip: req.ip,
      requestId: req.requestId,
    });

    res.json({ user: deleted });
  },
);

// GET /api/admin/audit-logs — Admin only: paginated audit logs (security-sensitive)
adminRouter.get(
  '/audit-logs',
  isAuthenticated,
  requireRole('admin'),
  validateQuery(auditLogsQuerySchema),
  async (_req: Request, res: Response) => {
    const { page, limit, action, actorId, dateFrom, dateTo, targetType } = res.locals
      .validatedQuery as {
      page: number;
      limit: number;
      action?: string;
      actorId?: number;
      dateFrom?: string;
      dateTo?: string;
      targetType?: string;
    };

    const result = await listAuditLogsUseCase.execute({
      action,
      actorId,
      targetType,
      dateFrom,
      dateTo,
      pagination: { page, limit },
    });

    res.json(result);
  },
);

// GET /api/admin/stats — Admin & moderator: dashboard statistics
adminRouter.get(
  '/stats',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  async (_req: Request, res: Response) => {
    const stats = await getStatsUseCase.execute();
    res.json(stats);
  },
);

// ─── Content Moderation (S4-03) ───

// GET /api/admin/reports — Admin & moderator: paginated report list
adminRouter.get(
  '/reports',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  validateQuery(listReportsQuerySchema),
  async (_req: Request, res: Response) => {
    const { page, limit, status, reason, dateFrom, dateTo } = res.locals.validatedQuery as {
      page: number;
      limit: number;
      status?: 'pending' | 'reviewed' | 'dismissed';
      reason?: string;
      dateFrom?: string;
      dateTo?: string;
    };

    const result = await listReportsUseCase.execute({
      status,
      reason,
      dateFrom,
      dateTo,
      pagination: { page, limit },
    });

    res.json(result);
  },
);

// PATCH /api/admin/reports/:id — Admin & moderator: resolve a report
adminRouter.patch(
  '/reports/:id',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  validateBody(resolveReportSchema),
  async (req: Request, res: Response) => {
    const reportId = parseStringParam(req, 'id');
    if (!reportId) throw badRequest('Invalid report ID');
    const { status, reviewerNotes } = req.body as {
      status: string;
      reviewerNotes?: string;
    };

    const result = await resolveReportUseCase.execute({
      reportId,
      status,
      reviewerNotes,
      reviewedBy: req.user?.id ?? 0,
      ip: req.ip,
      requestId: req.requestId,
    });

    res.json({ report: result });
  },
);

// ─── Analytics API (S4-04) ───

// GET /api/admin/analytics/usage — Admin only: usage time-series
adminRouter.get(
  '/analytics/usage',
  isAuthenticated,
  requireRole('admin'),
  validateQuery(usageAnalyticsQuerySchema),
  async (_req: Request, res: Response) => {
    const { granularity, from, to, days } = res.locals.validatedQuery as UsageAnalyticsQuery;

    const result = await getUsageAnalyticsUseCase.execute({
      granularity,
      from,
      to,
      days,
    });

    res.json(result);
  },
);

// GET /api/admin/analytics/content — Admin only: content analytics
adminRouter.get(
  '/analytics/content',
  isAuthenticated,
  requireRole('admin'),
  validateQuery(contentAnalyticsQuerySchema),
  async (_req: Request, res: Response) => {
    const { from, to, limit } = res.locals.validatedQuery as ContentAnalyticsQuery;

    const result = await getContentAnalyticsUseCase.execute({ from, to, limit });

    res.json(result);
  },
);

// GET /api/admin/analytics/engagement — Admin only: engagement analytics
adminRouter.get(
  '/analytics/engagement',
  isAuthenticated,
  requireRole('admin'),
  validateQuery(engagementAnalyticsQuerySchema),
  async (_req: Request, res: Response) => {
    const { from, to } = res.locals.validatedQuery as EngagementAnalyticsQuery;

    const result = await getEngagementAnalyticsUseCase.execute({ from, to });

    res.json(result);
  },
);

// ─── Support Tickets (S4-11) ───

// GET /api/admin/tickets — Admin & moderator: paginated ticket list
adminRouter.get(
  '/tickets',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  validateQuery(listTicketsQuerySchema),
  async (_req: Request, res: Response) => {
    const { page, limit, status, priority } = res.locals.validatedQuery as ListTicketsQuery;

    const result = await adminSupportFacade.list({
      status,
      priority,
      page,
      limit,
    });

    res.json(result);
  },
);

// PATCH /api/admin/tickets/:id — Admin & moderator: update ticket status/priority/assignment
adminRouter.patch(
  '/tickets/:id',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  validateBody(updateTicketSchema),
  async (req: Request, res: Response) => {
    const ticketId = parseStringParam(req, 'id');
    if (!ticketId) throw badRequest('Invalid ticket ID');
    const { status, priority, assignedTo } = req.body as {
      status?: string;
      priority?: string;
      assignedTo?: number | null;
    };

    const updated = await adminSupportFacade.update({
      ticketId,
      status,
      priority,
      assignedTo,
      actorId: req.user?.id ?? 0,
      ip: req.ip,
      requestId: req.requestId,
    });

    res.json({ ticket: updated });
  },
);

// ─── Reviews Moderation ───

// GET /api/admin/reviews — Admin & moderator: paginated review list (filterable by status)
adminRouter.get(
  '/reviews',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  validateQuery(listReviewsQuerySchema),
  async (_req: Request, res: Response) => {
    const { page, limit, status } = res.locals.validatedQuery as ListReviewsQuery;

    const result = await adminReviewFacade.list({
      status,
      page,
      limit,
    });

    res.json(result);
  },
);

// PATCH /api/admin/reviews/:id — Admin & moderator: moderate a review (approve/reject)
adminRouter.patch(
  '/reviews/:id',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  validateBody(moderateReviewSchema),
  async (req: Request, res: Response) => {
    const reviewId = parseStringParam(req, 'id');
    if (!reviewId) throw badRequest('Invalid review ID');
    const { status } = req.body as { status: string };
    const actorId = req.user?.id;
    if (!actorId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const updated = await adminReviewFacade.moderateReview({
      reviewId,
      status,
      actorId,
      ip: req.ip,
      requestId: (req as { requestId?: string }).requestId,
    });

    res.json({ review: updated });
  },
);

export default adminRouter;
