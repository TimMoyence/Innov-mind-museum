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

import type { B2bLeadRole } from '@modules/leads/domain/ports/b2b-lead-notifier.port';

const leadsRouter: Router = Router();

// R12 — mirror `supportContactLimiter` (5 req / 600s / IP) per R4 §3.4.
const b2bLeadLimiter = createRateLimitMiddleware({
  limit: 5,
  windowMs: 600_000,
  keyGenerator: byIp,
});

// R3 R12 — dedicated limiter with the same envelope (5 req / 600s / IP) but
// isolated counters so a spike on /beta does not starve /b2b. Same byIp
// keyGenerator (counters are per-instance regardless).
const betaSignupLimiter = createRateLimitMiddleware({
  limit: 5,
  windowMs: 600_000,
  keyGenerator: byIp,
});

// R1 (C6) — dedicated limiter for the paywall-interest endpoint. Same
// envelope (5 req / 600s / IP) as `/beta` ; isolated counters so a spike on
// the paywall modal can't starve the landing form (or vice versa).
const paywallInterestLimiter = createRateLimitMiddleware({
  limit: 5,
  windowMs: 600_000,
  keyGenerator: byIp,
});

// POST /api/leads/b2b — Public B2B-lead submission (R4 §1 R7, R10-R13)
leadsRouter.post(
  '/b2b',
  b2bLeadLimiter,
  validateBody(submitB2bLeadSchema),
  async (req: Request, res: Response) => {
    const body = req.body as {
      email: string;
      name: string;
      museum: string;
      role: B2bLeadRole;
      message: string;
      consent: true;
      website?: string;
    };

    await submitB2bLeadUseCase.execute({
      email: body.email,
      name: body.name,
      museum: body.museum,
      role: body.role,
      message: body.message,
      consent: body.consent,
      website: body.website,
      ip: req.ip,
      requestId: req.requestId,
      userAgent: req.get('user-agent'),
    });

    res.status(202).json({ accepted: true });
  },
);

// POST /api/leads/beta — Public beta-signup submission (R3 §1 R6, R10-R12, R16)
leadsRouter.post(
  '/beta',
  betaSignupLimiter,
  validateBody(submitBetaSignupSchema),
  async (req: Request, res: Response) => {
    const body = req.body as {
      email: string;
      consent: true;
      website?: string;
    };

    await submitBetaSignupUseCase.execute({
      email: body.email,
      consent: body.consent,
      website: body.website,
      ip: req.ip,
      requestId: req.requestId,
      userAgent: req.get('user-agent'),
    });

    res.status(202).json({ accepted: true });
  },
);

// POST /api/leads/paywall-interest — Public paywall email-capture (R1 §1 R18-R23)
// Mirror shape of /beta : honeypot silent-drop policed inside the use case
// (R23, mirror R3 R10) ; rate-limit isolated per limiter ; CSRF-exempt per
// N16 (unauthenticated public endpoint, no cookie-auth context).
leadsRouter.post(
  '/paywall-interest',
  paywallInterestLimiter,
  validateBody(submitPaywallInterestSchema),
  async (req: Request, res: Response) => {
    const body = req.body as {
      email: string;
      consent: true;
      website?: string;
    };

    await submitPaywallInterestUseCase.execute({
      email: body.email,
      consent: body.consent,
      website: body.website,
      ip: req.ip,
      requestId: req.requestId,
      userAgent: req.get('user-agent'),
    });

    res.status(202).json({ accepted: true });
  },
);

export default leadsRouter;
