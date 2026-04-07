import { type Request, type Response, Router } from 'express';

import { auditService } from '@shared/audit';
import { logger } from '@shared/logger/logger';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { requireRole } from '@src/helpers/middleware/require-role.middleware';

import type { CacheService } from '@shared/cache/cache.port';

/**
 * Builds the admin cache purge router.
 *
 * @param cache - Cache service for key deletion.
 * @returns Express Router with POST /museums/:id/cache/purge.
 */
export function createCachePurgeRouter(cache: CacheService): Router {
  const router = Router();

  // POST /api/admin/museums/:id/cache/purge — Admin only: purge LLM cache for a museum
  router.post(
    '/museums/:id/cache/purge',
    isAuthenticated,
    requireRole('admin'),
    async (req: Request, res: Response) => {
      const museumId = req.params.id;
      const adminId = req.user?.id ?? null;
      const start = Date.now();

      await cache.delByPrefix(`chat:llm:${museumId}:`);

      const durationMs = Date.now() - start;
      logger.warn('llm_cache_admin_purged', { museumId, adminId, durationMs });

      if (adminId) {
        auditService.log({
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
