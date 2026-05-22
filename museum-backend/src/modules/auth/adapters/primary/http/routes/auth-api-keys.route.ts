import { type Request, type Response, Router } from 'express';

import { apiKeyLimiter } from '@modules/auth/adapters/primary/http/helpers/auth-rate-limiters';
import { createApiKeySchema } from '@modules/auth/adapters/primary/http/schemas/auth.schemas';
import { UserRole } from '@modules/auth/domain/user/user-role';
import {
  generateApiKeyUseCase,
  listApiKeysUseCase,
  revokeApiKeyUseCase,
} from '@modules/auth/useCase';
import { auditService } from '@shared/audit';
import { AUDIT_API_KEY_CREATED, AUDIT_API_KEY_REVOKED } from '@shared/audit/audit.types';
import { badRequest } from '@shared/errors/app.error';
import { requireUser } from '@shared/http/requireUser';
import { isAuthenticatedJwtOnly } from '@shared/middleware/authenticated.middleware';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import { requireRole } from '@shared/middleware/require-role.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';

const authApiKeysRouter: Router = Router();

authApiKeysRouter.post(
  '/api-keys',
  isAuthenticatedJwtOnly,
  // I-SEC4 (design D3) — `msk_` B2B keys are a privileged operator capability.
  // Gate runs BEFORE the rate limiter so unauthorized requests 403 without
  // burning the bucket (express mutating-middleware-order, lib-docs/express/LESSONS.md).
  // `super_admin` implicit (centralized in requireRole).
  requireRole(UserRole.MUSEUM_MANAGER, UserRole.ADMIN),
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
    const rawId = parseStringParam(req, 'id');
    if (!rawId) {
      throw badRequest('Invalid API key ID');
    }
    const keyId = Number.parseInt(rawId, 10);
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
