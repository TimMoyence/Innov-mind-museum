import { Router } from 'express';

import {
  selectArtworkForDate,
  toDateString,
} from '@modules/daily-art/useCase/getDailyArtwork.useCase';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';

import type { Artwork } from '@modules/daily-art/domain/artwork.types';
import type { CacheService } from '@shared/cache/cache.port';
import type { Request, Response } from 'express';

const CACHE_TTL_SECONDS = 86_400; // 24 hours

export const createDailyArtRouter = (cacheService?: CacheService): Router => {
  const dailyArtRouter: Router = Router();

  // GET /api/daily-art — returns 1 artwork per day (deterministic rotation)
  dailyArtRouter.get('/', isAuthenticated, async (_req: Request, res: Response) => {
    const now = new Date();
    const dateStr = toDateString(now);
    const cacheKey = `daily-art:${dateStr}`;

    if (cacheService) {
      const cached = await cacheService.get<Artwork>(cacheKey);
      if (cached) {
        res.json({ artwork: cached });
        return;
      }
    }

    const artwork = selectArtworkForDate(now);

    if (cacheService) {
      await cacheService.set(cacheKey, artwork, CACHE_TTL_SECONDS);
    }

    res.json({ artwork });
  });

  return dailyArtRouter;
};
