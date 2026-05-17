import { type Request, type Response, Router } from 'express';

import { auditService } from '@shared/audit';
import { badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import { requireRole } from '@shared/middleware/require-role.middleware';

import type { CacheService } from '@shared/cache/cache.port';

export function createCachePurgeRouter(cache: CacheService): Router {
  const router = Router();

  router.post(
    '/museums/:id/cache/purge',
    isAuthenticated,
    requireRole('admin'),
    async (req: Request, res: Response) => {
      const museumId = parseStringParam(req, 'id');
      if (!museumId) throw badRequest('museum id param is required');
      const adminId = req.user?.id ?? null;
      const start = Date.now();

      await cache.delByPrefix(`chat:llm:${museumId}:`);

      const durationMs = Date.now() - start;
      logger.warn('llm_cache_admin_purged', { museumId, adminId, durationMs });

      if (adminId) {
        await auditService.log({
          action: 'CACHE_PURGE',
          actorType: 'user',
          actorId: adminId,
          targetType: 'museum',
          targetId: museumId,
          metadata: { durationMs },
          ip: req.ip,
          requestId: req.requestId,
        });
      }

      res.json({ museumId, durationMs });
    },
  );

  return router;
}
