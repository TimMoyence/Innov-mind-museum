import { type Request, type Response, Router } from 'express';

import {
  submitB2bLeadSchema,
  submitBetaSignupSchema,
  submitPaywallInterestSchema,
} from '@modules/leads/adapters/primary/http/schemas/leads.schemas';
import {
  submitB2bLeadUseCase,
  submitBetaSignupUseCase,
  submitPaywallInterestUseCase,
} from '@modules/leads/useCase';
import { byIp, createRateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';

import type { z } from 'zod';

interface LeadRequestContext {
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

const leadSubmission = <TSchema extends z.ZodType<object>>(
  schema: TSchema,
  useCase: { execute: (input: z.infer<TSchema> & LeadRequestContext) => Promise<void> },
) => [
  validateBody(schema),
  createRateLimitMiddleware({ limit: 5, windowMs: 600_000, keyGenerator: byIp }),
  async (req: Request, res: Response): Promise<void> => {
    await useCase.execute({
      ...(req.body as z.infer<TSchema>),
      ip: req.ip,
      requestId: req.requestId,
      userAgent: req.get('user-agent'),
    });
    res.status(202).json({ accepted: true });
  },
];

const leadsRouter: Router = Router();

leadsRouter.post('/b2b', ...leadSubmission(submitB2bLeadSchema, submitB2bLeadUseCase));
leadsRouter.post('/beta', ...leadSubmission(submitBetaSignupSchema, submitBetaSignupUseCase));
leadsRouter.post(
  '/paywall-interest',
  ...leadSubmission(submitPaywallInterestSchema, submitPaywallInterestUseCase),
);

export default leadsRouter;
