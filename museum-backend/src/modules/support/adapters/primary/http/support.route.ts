import { NextFunction, Request, Response, Router } from 'express';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { badRequest } from '@shared/errors/app.error';
import {
  createTicketUseCase,
  listUserTicketsUseCase,
  getTicketDetailUseCase,
  addTicketMessageUseCase,
} from '../../../useCase';

const supportRouter: Router = Router();

// POST /api/support/tickets — Authenticated user: create a support ticket
supportRouter.post(
  '/tickets',
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { subject, description, priority, category } = (req.body || {}) as {
        subject?: string;
        description?: string;
        priority?: string;
        category?: string;
      };

      if (!subject || typeof subject !== 'string') {
        throw badRequest('subject is required');
      }
      if (!description || typeof description !== 'string') {
        throw badRequest('description is required');
      }

      const ticket = await createTicketUseCase.execute({
        userId: req.user!.id,
        subject,
        description,
        priority,
        category,
        ip: req.ip,
        requestId: req.requestId,
      });

      res.status(201).json({ ticket });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/support/tickets — Authenticated user: list own tickets
supportRouter.get(
  '/tickets',
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const status = (req.query.status as string) || undefined;
      const priority = (req.query.priority as string) || undefined;

      const result = await listUserTicketsUseCase.execute({
        userId: req.user!.id,
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

// GET /api/support/tickets/:id — Authenticated user: get ticket detail (ownership check)
supportRouter.get(
  '/tickets/:id',
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await getTicketDetailUseCase.execute({
        ticketId: req.params.id,
        userId: req.user!.id,
        userRole: req.user!.role,
      });

      res.json({ ticket });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/support/tickets/:id/messages — Authenticated user: add message (ownership check)
supportRouter.post(
  '/tickets/:id/messages',
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text } = (req.body || {}) as { text?: string };
      if (!text || typeof text !== 'string') {
        throw badRequest('text is required');
      }

      const message = await addTicketMessageUseCase.execute({
        ticketId: req.params.id,
        senderId: req.user!.id,
        senderRole: req.user!.role,
        text,
      });

      res.status(201).json({ message });
    } catch (error) {
      next(error);
    }
  },
);

export default supportRouter;
