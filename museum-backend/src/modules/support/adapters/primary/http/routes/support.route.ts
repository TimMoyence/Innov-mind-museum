import { type Request, type Response, Router } from 'express';

import {
  createTicketSchema,
  submitSupportContactSchema,
  addTicketMessageSchema,
  listTicketsQuerySchema,
} from '@modules/support/adapters/primary/http/schemas/support.schemas';
import {
  createTicketUseCase,
  submitSupportContactUseCase,
  listUserTicketsUseCase,
  getTicketDetailUseCase,
  addTicketMessageUseCase,
} from '@modules/support/useCase';
import { badRequest } from '@shared/errors/app.error';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import { byIp, createRateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';
import { validateQuery } from '@shared/middleware/validate-query.middleware';

const supportRouter: Router = Router();

const supportContactLimiter = createRateLimitMiddleware({
  limit: 5,
  windowMs: 600_000,
  keyGenerator: byIp,
});

supportRouter.post(
  '/contact',
  supportContactLimiter,
  validateBody(submitSupportContactSchema),
  async (req: Request, res: Response) => {
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
  },
);

supportRouter.post(
  '/tickets',
  isAuthenticated,
  validateBody(createTicketSchema),
  async (req: Request, res: Response) => {
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
  },
);

supportRouter.get(
  '/tickets',
  isAuthenticated,
  validateQuery(listTicketsQuerySchema),
  async (req: Request, res: Response) => {
    const { page, limit, status, priority } = res.locals.validatedQuery as {
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
  },
);

supportRouter.get('/tickets/:id', isAuthenticated, async (req: Request, res: Response) => {
  const ticketId = parseStringParam(req, 'id');
  if (!ticketId) throw badRequest('ticket id param is required');
  const ticket = await getTicketDetailUseCase.execute({
    ticketId,
    userId: req.user?.id ?? 0,
    userRole: req.user?.role ?? 'visitor',
  });

  res.json({ ticket });
});

supportRouter.post(
  '/tickets/:id/messages',
  isAuthenticated,
  validateBody(addTicketMessageSchema),
  async (req: Request, res: Response) => {
    const { text } = req.body as { text: string };
    const ticketId = parseStringParam(req, 'id');
    if (!ticketId) throw badRequest('ticket id param is required');

    const message = await addTicketMessageUseCase.execute({
      ticketId,
      senderId: req.user?.id ?? 0,
      senderRole: req.user?.role ?? 'visitor',
      text,
    });

    res.status(201).json({ message });
  },
);

export default supportRouter;
