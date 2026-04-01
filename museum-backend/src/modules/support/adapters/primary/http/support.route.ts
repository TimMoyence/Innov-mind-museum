import { type NextFunction, type Request, type Response, Router } from 'express';

import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { byIp, createRateLimitMiddleware } from '@src/helpers/middleware/rate-limit.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';
import { validateQuery } from '@src/helpers/middleware/validate-query.middleware';

import {
  createTicketSchema,
  submitSupportContactSchema,
  addTicketMessageSchema,
  listTicketsQuerySchema,
} from './support.schemas';
import {
  createTicketUseCase,
  submitSupportContactUseCase,
  listUserTicketsUseCase,
  getTicketDetailUseCase,
  addTicketMessageUseCase,
} from '../../../useCase';

const supportRouter: Router = Router();

const supportContactLimiter = createRateLimitMiddleware({
  limit: 5,
  windowMs: 600_000,
  keyGenerator: byIp,
});

// POST /api/support/contact — Public contact form submission
supportRouter.post(
  '/contact',
  supportContactLimiter,
  validateBody(submitSupportContactSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, message } = req.body as {
        name: string;
        email: string;
        message: string;
      };

      await submitSupportContactUseCase.execute({
        name,
        email,
        message,
        ip: req.ip,
        requestId: req.requestId,
        userAgent: req.get('user-agent'),
      });

      res.status(202).json({ accepted: true });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/support/tickets — Authenticated user: create a support ticket
supportRouter.post(
  '/tickets',
  isAuthenticated,
  validateBody(createTicketSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { subject, description, priority, category } = req.body as {
        subject: string;
        description: string;
        priority?: string;
        category?: string;
      };

      const ticket = await createTicketUseCase.execute({
        userId: req.user?.id ?? 0,
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
  validateQuery(listTicketsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, status, priority } = req.query as unknown as {
        page: number;
        limit: number;
        status?: string;
        priority?: string;
      };

      const result = await listUserTicketsUseCase.execute({
        userId: req.user?.id ?? 0,
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
        userId: req.user?.id ?? 0,
        userRole: req.user?.role ?? 'visitor',
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
  validateBody(addTicketMessageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text } = req.body as { text: string };

      const message = await addTicketMessageUseCase.execute({
        ticketId: req.params.id,
        senderId: req.user?.id ?? 0,
        senderRole: req.user?.role ?? 'visitor',
        text,
      });

      res.status(201).json({ message });
    } catch (error) {
      next(error);
    }
  },
);

export default supportRouter;
