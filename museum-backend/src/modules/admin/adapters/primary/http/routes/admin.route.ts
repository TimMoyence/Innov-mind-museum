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
  statsQuerySchema,
  type UsageAnalyticsQuery,
  type ContentAnalyticsQuery,
  type EngagementAnalyticsQuery,
  type ListTicketsQuery,
  type ListReviewsQuery,
  type StatsQuery,
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
import { getChatSessionForModerationUseCase } from '@modules/admin/useCase/chat/composition';
import { moderateReviewSchema } from '@modules/review/adapters/primary/http/schemas/review.schemas';
import { getNpsUseCase } from '@modules/review/useCase';
import { computeTenantScope } from '@shared/authz/tenant-scope';
import { forbidden, invalidInput } from '@shared/errors/app.error';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import { requireRole } from '@shared/middleware/require-role.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';
import { validateQuery } from '@shared/middleware/validate-query.middleware';

const adminRouter: Router = Router();

function parseUserIdParam(req: Request): number {
  const raw = parseStringParam(req, 'id');
  if (!raw) throw invalidInput('Invalid user ID');
  const userId = Number.parseInt(raw, 10);
  if (Number.isNaN(userId)) throw invalidInput('Invalid user ID');
  return userId;
}

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

adminRouter.get(
  '/chat/sessions/:id',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  async (req: Request, res: Response) => {
    const sessionId = parseStringParam(req, 'id');
    if (!sessionId) throw invalidInput('Invalid session ID');

    const result = await getChatSessionForModerationUseCase().execute({
      sessionId,
      actorId: req.user?.id ?? 0,
      ip: req.ip,
      requestId: req.requestId,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
    });

    res.status(200).json(result);
  },
);

adminRouter.get(
  '/stats',
  isAuthenticated,
  requireRole('admin', 'moderator', 'museum_manager'),
  validateQuery(statsQuerySchema),
  async (req: Request, res: Response) => {
    const { museumId: queryMuseumId } = res.locals.validatedQuery as StatsQuery;

    let scopedMuseumId: number | undefined = queryMuseumId;
    if (req.user?.role === 'museum_manager') {
      scopedMuseumId = req.user.museumId ?? undefined;
    }

    const stats = await getStatsUseCase.execute({
      role: req.user?.role,
      museumId: scopedMuseumId,
    });
    res.json(stats);
  },
);

adminRouter.get(
  '/nps',
  isAuthenticated,
  requireRole('admin', 'moderator', 'museum_manager'),
  validateQuery(statsQuerySchema),
  async (req: Request, res: Response) => {
    const { museumId: queryMuseumId } = res.locals.validatedQuery as StatsQuery;

    let scopedMuseumId: number | undefined = queryMuseumId;
    if (req.user?.role === 'museum_manager') {
      if (req.user.museumId == null) {
        throw forbidden('Museum scope required');
      }
      scopedMuseumId = req.user.museumId;
    }

    const nps = await getNpsUseCase.execute({ museumId: scopedMuseumId });
    res.json(nps);
  },
);

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

adminRouter.patch(
  '/reports/:id',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  validateBody(resolveReportSchema),
  async (req: Request, res: Response) => {
    const reportId = parseStringParam(req, 'id');
    if (!reportId) throw invalidInput('Invalid report ID');
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

adminRouter.get(
  '/tickets',
  isAuthenticated,
  requireRole('admin', 'moderator', 'museum_manager'),
  validateQuery(listTicketsQuerySchema),
  async (req: Request, res: Response) => {
    const { page, limit, status, priority } = res.locals.validatedQuery as ListTicketsQuery;

    const scopedMuseumId = computeTenantScope(req.user?.role, req.user?.museumId);

    const result = await adminSupportFacade.list({
      status,
      priority,
      page,
      limit,
      museumId: scopedMuseumId,
    });

    res.json(result);
  },
);

adminRouter.patch(
  '/tickets/:id',
  isAuthenticated,
  requireRole('admin', 'moderator', 'museum_manager'),
  validateBody(updateTicketSchema),
  async (req: Request, res: Response) => {
    const ticketId = parseStringParam(req, 'id');
    if (!ticketId) throw invalidInput('Invalid ticket ID');
    const { status, priority, assignedTo } = req.body as {
      status?: string;
      priority?: string;
      assignedTo?: number | null;
    };

    const scopedMuseumId = computeTenantScope(req.user?.role, req.user?.museumId);

    const updated = await adminSupportFacade.update({
      ticketId,
      status,
      priority,
      assignedTo,
      actorId: req.user?.id ?? 0,
      ip: req.ip,
      requestId: req.requestId,
      scopeMuseumId: scopedMuseumId,
    });

    res.json({ ticket: updated });
  },
);

adminRouter.get(
  '/reviews',
  isAuthenticated,
  requireRole('admin', 'moderator', 'museum_manager'),
  validateQuery(listReviewsQuerySchema),
  async (req: Request, res: Response) => {
    const { page, limit, status } = res.locals.validatedQuery as ListReviewsQuery;

    const scopedMuseumId = computeTenantScope(req.user?.role, req.user?.museumId);

    const result = await adminReviewFacade.list({
      status,
      page,
      limit,
      museumId: scopedMuseumId,
    });

    res.json(result);
  },
);

adminRouter.patch(
  '/reviews/:id',
  isAuthenticated,
  requireRole('admin', 'moderator', 'museum_manager'),
  validateBody(moderateReviewSchema),
  async (req: Request, res: Response) => {
    const reviewId = parseStringParam(req, 'id');
    if (!reviewId) throw invalidInput('Invalid review ID');
    const { status } = req.body as { status: string };
    const actorId = req.user?.id;
    if (!actorId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const scopedMuseumId = computeTenantScope(req.user?.role, req.user?.museumId);

    const updated = await adminReviewFacade.moderateReview({
      reviewId,
      status,
      actorId,
      ip: req.ip,
      requestId: (req as { requestId?: string }).requestId,
      scopeMuseumId: scopedMuseumId,
    });

    res.json({ review: updated });
  },
);

export default adminRouter;
