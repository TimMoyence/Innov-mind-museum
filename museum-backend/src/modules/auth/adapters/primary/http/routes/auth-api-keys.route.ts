import { type Request, type Response, Router } from 'express';

import { apiKeyLimiter } from '@modules/auth/adapters/primary/http/helpers/auth-rate-limiters';
import { createApiKeySchema } from '@modules/auth/adapters/primary/http/schemas/auth.schemas';
import {
  generateApiKeyUseCase,
  listApiKeysUseCase,
  revokeApiKeyUseCase,
} from '@modules/auth/useCase';
import { auditService } from '@shared/audit';
import { AUDIT_API_KEY_CREATED, AUDIT_API_KEY_REVOKED } from '@shared/audit/audit.types';
import { badRequest } from '@shared/errors/app.error';
import { requireUser } from '@shared/http/requireUser';
import { isAuthenticatedJwtOnly } from '@src/helpers/middleware/authenticated.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';

/**
 * Sub-router for the B2B API-key programme:
 * POST /api-keys, GET /api-keys, DELETE /api-keys/:id.
 */
const authApiKeysRouter: Router = Router();

authApiKeysRouter.post(
  '/api-keys',
  isAuthenticatedJwtOnly,
  apiKeyLimiter,
  validateBody(createApiKeySchema),
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const { name, expiresAt } = req.body;
    const expiry = expiresAt ? new Date(expiresAt) : undefined;
    const result = await generateApiKeyUseCase.execute(jwtUser.id, name, expiry);
    await auditService.log({
      action: AUDIT_API_KEY_CREATED,
      actorType: 'user',
      actorId: jwtUser.id,
      targetType: 'api_key',
      targetId: result.apiKey.prefix,
      metadata: { name },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(201).json(result);
  },
);

authApiKeysRouter.get('/api-keys', isAuthenticatedJwtOnly, async (req: Request, res: Response) => {
  const jwtUser = requireUser(req);
  const result = await listApiKeysUseCase.execute(jwtUser.id);
  res.status(200).json(result);
});

authApiKeysRouter.delete(
  '/api-keys/:id',
  isAuthenticatedJwtOnly,
  async (req: Request, res: Response) => {
    const jwtUser = requireUser(req);
    const keyId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(keyId)) {
      throw badRequest('Invalid API key ID');
    }
    const result = await revokeApiKeyUseCase.execute(keyId, jwtUser.id);
    await auditService.log({
      action: AUDIT_API_KEY_REVOKED,
      actorType: 'user',
      actorId: jwtUser.id,
      targetType: 'api_key',
      targetId: String(keyId),
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json(result);
  },
);

export default authApiKeysRouter;
