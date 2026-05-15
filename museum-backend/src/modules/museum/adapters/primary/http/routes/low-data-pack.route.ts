import { Router } from 'express';

import { badRequest } from '@shared/errors/app.error';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import { byIp, createRateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';

import type { LowDataPackService } from '@modules/museum/useCase/search/low-data-pack.service';

/**
 * Builds the low-data pack Express router.
 *
 * @param service - LowDataPackService instance.
 * @returns Express Router with GET /museums/:id/low-data-pack.
 */
export function createLowDataPackRouter(service: LowDataPackService): Router {
  const router = Router();

  const lowDataPackLimiter = createRateLimitMiddleware({
    limit: 10,
    windowMs: 60_000,
    keyGenerator: byIp,
    bucketName: 'low-data-pack',
  });

  router.get(
    '/museums/:id/low-data-pack',
    isAuthenticated,
    lowDataPackLimiter,
    async (req, res, next) => {
      try {
        const museumId = parseStringParam(req, 'id');
        if (!museumId) {
          throw badRequest('museum id param is required');
        }
        const locale = typeof req.query.locale === 'string' ? req.query.locale : 'fr';
        const pack = await service.getLowDataPack(museumId, locale);
        res.set('Cache-Control', 'public, max-age=3600');
        res.json(pack);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
