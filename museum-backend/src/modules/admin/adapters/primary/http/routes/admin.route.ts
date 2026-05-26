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

// Includes soft-deleted rows. Moderators read for ticket triage.
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

// R1 §1 R14-R16 — super_admin override only. `admin` + `museum_manager` NOT
// allowed (per spec brief R1 §0.3).
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

// super_admin-only: prevents a rogue B2B admin from freezing a tenant peer.
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

// Soft-delete only. Hard erasure (RGPD Art. 17 full erase) deferred V1.1 (ADR-052).
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

/**
 * Wave B C8/C9 — admin stats with optional museumId scope (R-C8).
 *
 * RBAC (D6, OWASP API3 / BOLA) :
 *   - `super_admin`     → museumId free (cross-tenant view legitimate).
 *   - `admin/moderator` → museumId free (platform staff).
 *   - `museum_manager`  → museumId FORCED to JWT claim. Any other value is
 *                         rewritten silently to the caller's tenant so a
 *                         crafted `?museumId=99` cannot smuggle another
 *                         tenant's aggregate (BOLA negative guard).
 *
 * `museum_manager` is added to the requireRole allow-list so the gate stops
 * blocking the role at the entry (was admin/moderator only — paired with
 * the FE AdminShell allow-list update in C9).
 */
adminRouter.get(
  '/stats',
  isAuthenticated,
  requireRole('admin', 'moderator', 'museum_manager'),
  validateQuery(statsQuerySchema),
  async (req: Request, res: Response) => {
    const { museumId: queryMuseumId } = res.locals.validatedQuery as StatsQuery;

    // Forced scope for museum_manager — JWT museumId claim wins over any
    // user-supplied query param. Other roles see the queryMuseumId as-is.
    let scopedMuseumId: number | undefined = queryMuseumId;
    if (req.user?.role === 'museum_manager') {
      scopedMuseumId = req.user.museumId ?? undefined;
    }

    // Thread the role so the use-case owns the scope decision (super_admin/
    // admin → global; museum_manager → forced museumId or 403 if unassigned).
    // The route never decides the shape or the 403 (design D3 — single
    // hexagonal source of truth).
    const stats = await getStatsUseCase.execute({
      role: req.user?.role,
      museumId: scopedMuseumId,
    });
    res.json(stats);
  },
);

// S4-03 Content Moderation
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

// S4-04 Analytics
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

// S4-11 Support Tickets
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

// Reviews Moderation
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
