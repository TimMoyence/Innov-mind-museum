import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { requireUser } from '@shared/http/requireUser';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';

import { CONSENT_SCOPES } from '../../../domain/userConsent.entity';
import { grantConsentUseCase, revokeConsentUseCase, userConsentRepository } from '../../../useCase';

/** Zod schema for POST /api/auth/consent. */
export const grantConsentSchema = z.object({
  scope: z.enum(CONSENT_SCOPES as readonly [string, ...string[]]),
  version: z.string().min(1).max(32),
});

/**
 * Express router for GDPR Art.7 consent management. Grants, revokes, and lists
 * are authenticated JWT endpoints — visitors (and all roles) may manage their
 * own consents.
 */
const consentRouter: Router = Router();

consentRouter.post(
  '/',
  isAuthenticated,
  validateBody(grantConsentSchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { scope, version } = req.body as z.infer<typeof grantConsentSchema>;
    const record = await grantConsentUseCase.execute(jwtUser.id, scope, version, 'api');
    res.status(201).json({
      consent: {
        id: record.id,
        scope: record.scope,
        version: record.version,
        grantedAt: record.grantedAt,
        source: record.source,
      },
    });
  },
);

consentRouter.delete('/:scope', isAuthenticated, async (req: Request, res: Response) => {
  const jwtUser = requireUser(req);
  const { scope } = req.params;
  await revokeConsentUseCase.execute(jwtUser.id, scope);
  res.status(200).json({ revoked: true, scope });
});

consentRouter.get('/', isAuthenticated, async (req: Request, res: Response) => {
  const jwtUser = requireUser(req);
  const rows = await userConsentRepository.listForUser(jwtUser.id);
  res.status(200).json({
    consents: rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      version: row.version,
      grantedAt: row.grantedAt,
      revokedAt: row.revokedAt,
      source: row.source,
    })),
  });
});

export default consentRouter;
