import { NextFunction, Request, Response, Router } from 'express';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { requireRole } from '@src/helpers/middleware/require-role.middleware';
import { badRequest } from '@shared/errors/app.error';
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
import {
  listAllTicketsUseCase,
  updateTicketStatusUseCase,
} from '@modules/support/useCase';

const adminRouter: Router = Router();

// GET /api/admin/users — Admin & moderator: paginated user list
adminRouter.get(
  '/users',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const search = (req.query.search as string) || undefined;
      const role = (req.query.role as string) || undefined;

      const result = await listUsersUseCase.execute({
        search,
        role,
        pagination: { page, limit },
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/admin/users/:id/role — Admin only: change user role
adminRouter.patch(
  '/users/:id/role',
  isAuthenticated,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.id, 10);
      if (isNaN(userId)) throw badRequest('Invalid user ID');

      const { role } = (req.body || {}) as { role?: string };
      if (!role || typeof role !== 'string') {
        throw badRequest('role is required');
      }

      const updated = await changeUserRoleUseCase.execute({
        userId,
        newRole: role,
        actorId: req.user!.id,
        ip: req.ip,
        requestId: req.requestId,
      });

      res.json({ user: updated });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/admin/audit-logs — Admin & moderator: paginated audit logs
adminRouter.get(
  '/audit-logs',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const action = (req.query.action as string) || undefined;
      const actorId = req.query.actorId
        ? parseInt(req.query.actorId as string, 10)
        : undefined;
      const targetType = (req.query.targetType as string) || undefined;
      const dateFrom = (req.query.dateFrom as string) || undefined;
      const dateTo = (req.query.dateTo as string) || undefined;

      const result = await listAuditLogsUseCase.execute({
        action,
        actorId,
        targetType,
        dateFrom,
        dateTo,
        pagination: { page, limit },
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/admin/stats — Admin & moderator: dashboard statistics
adminRouter.get(
  '/stats',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await getStatsUseCase.execute();
      res.json(stats);
    } catch (error) {
      next(error);
    }
  },
);

// ─── Content Moderation (S4-03) ───

// GET /api/admin/reports — Admin & moderator: paginated report list
adminRouter.get(
  '/reports',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const status = (req.query.status as string) || undefined;
      const reason = (req.query.reason as string) || undefined;
      const dateFrom = (req.query.dateFrom as string) || undefined;
      const dateTo = (req.query.dateTo as string) || undefined;

      const result = await listReportsUseCase.execute({
        status: status as 'pending' | 'reviewed' | 'dismissed' | undefined,
        reason,
        dateFrom,
        dateTo,
        pagination: { page, limit },
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/admin/reports/:id — Admin & moderator: resolve a report
adminRouter.patch(
  '/reports/:id',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reportId = req.params.id;
      const { status, reviewerNotes } = (req.body || {}) as {
        status?: string;
        reviewerNotes?: string;
      };

      if (!status || typeof status !== 'string') {
        throw badRequest('status is required');
      }

      const result = await resolveReportUseCase.execute({
        reportId,
        status,
        reviewerNotes,
        reviewedBy: req.user!.id,
        ip: req.ip,
        requestId: req.requestId,
      });

      res.json({ report: result });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Analytics API (S4-04) ───

// GET /api/admin/analytics/usage — Admin & moderator: usage time-series
adminRouter.get(
  '/analytics/usage',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const granularity = (req.query.granularity as string) || undefined;
      const from = (req.query.from as string) || undefined;
      const to = (req.query.to as string) || undefined;
      const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;

      const result = await getUsageAnalyticsUseCase.execute({
        granularity: granularity as 'daily' | 'weekly' | 'monthly' | undefined,
        from,
        to,
        days,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/admin/analytics/content — Admin & moderator: content analytics
adminRouter.get(
  '/analytics/content',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const from = (req.query.from as string) || undefined;
      const to = (req.query.to as string) || undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const result = await getContentAnalyticsUseCase.execute({ from, to, limit });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/admin/analytics/engagement — Admin & moderator: engagement analytics
adminRouter.get(
  '/analytics/engagement',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const from = (req.query.from as string) || undefined;
      const to = (req.query.to as string) || undefined;

      const result = await getEngagementAnalyticsUseCase.execute({ from, to });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// ─── Support Tickets (S4-11) ───

// GET /api/admin/tickets — Admin & moderator: paginated ticket list
adminRouter.get(
  '/tickets',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const status = (req.query.status as string) || undefined;
      const priority = (req.query.priority as string) || undefined;

      const result = await listAllTicketsUseCase.execute({
        status,
        priority,
        page,
        limit,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/admin/tickets/:id — Admin & moderator: update ticket status/priority/assignment
adminRouter.patch(
  '/tickets/:id',
  isAuthenticated,
  requireRole('admin', 'moderator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticketId = req.params.id;
      const { status, priority, assignedTo } = (req.body || {}) as {
        status?: string;
        priority?: string;
        assignedTo?: number | null;
      };

      const updated = await updateTicketStatusUseCase.execute({
        ticketId,
        status,
        priority,
        assignedTo,
        actorId: req.user!.id,
        ip: req.ip,
        requestId: req.requestId,
      });

      res.json({ ticket: updated });
    } catch (error) {
      next(error);
    }
  },
);

export default adminRouter;
