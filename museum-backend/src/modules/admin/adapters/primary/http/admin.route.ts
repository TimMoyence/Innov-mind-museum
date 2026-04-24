import { type Request, type Response, Router } from 'express';

import { moderateReviewSchema } from '@modules/review/adapters/primary/http/review.schemas';
import {
  listAllReviewsUseCase as listAllReviewsUseCaseInstance,
  moderateReviewUseCase as moderateReviewUseCaseInstance,
} from '@modules/review/useCase';
import { listAllTicketsUseCase, updateTicketStatusUseCase } from '@modules/support/useCase';
import { badRequest } from '@shared/errors/app.error';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { requireRole } from '@src/helpers/middleware/require-role.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';
import { validateQuery } from '@src/helpers/middleware/validate-query.middleware';

import {
  changeUserRoleSchema,
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
} from './admin.schemas';
import {
  listUsersUseCase,
  changeUserRoleUseCase,
  listAuditLogsUseCase,
  getStatsUseCase,
  listReportsUseCase,
  resolveReportUseCase,
  getUsageAnalyticsUseCase,
  getContentAnalyticsUseCase,
  getEngagementAnalyticsUseCase,
} from '../../../useCase';

const adminRouter: Router = Router();

// GET /api/admin/users — Admin only: paginated user list (PII least-privilege)
adminRouter.get(
  '/users',
  isAuthenticated,
  requireRole('admin'),
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

// PATCH /api/admin/users/:id/role — Admin only: change user role
adminRouter.patch(
  '/users/:id/role',
  isAuthenticated,
  requireRole('admin'),
  validateBody(changeUserRoleSchema),
  async (req: Request, res: Response) => {
    const userId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(userId)) throw badRequest('Invalid user ID');

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
    const reportId = req.params.id;
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

    const result = await listAllTicketsUseCase.execute({
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
    const ticketId = req.params.id;
    const { status, priority, assignedTo } = req.body as {
      status?: string;
      priority?: string;
      assignedTo?: number | null;
    };

    const updated = await updateTicketStatusUseCase.execute({
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

    const result = await listAllReviewsUseCaseInstance.execute({
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
    const reviewId = req.params.id;
    const { status } = req.body as { status: string };
    const actorId = req.user?.id;
    if (!actorId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const updated = await moderateReviewUseCaseInstance.execute({
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
