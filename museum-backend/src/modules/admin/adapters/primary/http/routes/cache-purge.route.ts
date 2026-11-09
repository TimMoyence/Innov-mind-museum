import { type Request, type Response, Router } from 'express';

import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm/llm-cache.service';
import { auditService } from '@shared/audit';
import { invalidInput } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import { requireRole } from '@shared/middleware/require-role.middleware';

import type { CacheService } from '@shared/cache/cache.port';

export function createCachePurgeRouter(cache: CacheService): Router {
  const router = Router();
  const llmCacheService = new LlmCacheServiceImpl(cache);

  router.post(
    '/museums/:id/cache/purge',
    isAuthenticated,
    requireRole('admin'),
    async (req: Request, res: Response) => {
      const museumIdStr = parseStringParam(req, 'id');
      if (!museumIdStr) throw invalidInput('museum id param is required');
      const museumIdInt = Number.parseInt(museumIdStr, 10);
      if (
        !Number.isInteger(museumIdInt) ||
        museumIdInt < 1 ||
        String(museumIdInt) !== museumIdStr
      ) {
        throw invalidInput('museum id must be a positive integer');
      }
      const adminId = req.user?.id ?? null;
      const start = Date.now();

      await llmCacheService.invalidateMuseum(museumIdInt);

      const durationMs = Date.now() - start;
      logger.warn('llm_cache_admin_purged', { museumId: museumIdInt, adminId, durationMs });

      if (adminId) {
        await auditService.log({
          action: 'CACHE_PURGE',
          actorType: 'user',
          actorId: adminId,
          targetType: 'museum',
          targetId: String(museumIdInt),
          metadata: { durationMs },
          ip: req.ip,
          requestId: req.requestId,
        });
      }

      res.json({ museumId: museumIdInt, durationMs });
    },
  );

  return router;
}
