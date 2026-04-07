import { Router } from 'express';

import type { LowDataPackService } from '../../../useCase/low-data-pack.service';

/**
 * Builds the low-data pack Express router.
 *
 * @param service - LowDataPackService instance.
 * @returns Express Router with GET /museums/:id/low-data-pack.
 */
export function createLowDataPackRouter(service: LowDataPackService): Router {
  const router = Router();

  router.get('/museums/:id/low-data-pack', async (req, res, next) => {
    try {
      const museumId = req.params.id;
      const locale = typeof req.query.locale === 'string' ? req.query.locale : 'fr';
      const pack = await service.getLowDataPack(museumId, locale);
      res.set('Cache-Control', 'public, max-age=3600');
      res.json(pack);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
