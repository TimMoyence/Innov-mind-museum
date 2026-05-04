import { Router } from 'express';

import {
  selectArtworkForDate,
  toDateString,
} from '@modules/daily-art/useCase/listing/getDailyArtwork.useCase';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';

import type { Artwork } from '@modules/daily-art/domain/artwork/artwork.types';
import type { CacheService } from '@shared/cache/cache.port';
import type { Request, Response } from 'express';

const CACHE_TTL_SECONDS = 86_400; // 24 hours

/**
 * Creates the daily-art Express router.
 *
 * @param cacheService - Optional cache service for Redis-backed 24h caching.
 * @returns Configured Express Router mounted at `/api/daily-art`.
 */
export const createDailyArtRouter = (cacheService?: CacheService): Router => {
  const dailyArtRouter: Router = Router();

  // GET /api/daily-art — returns 1 artwork per day (deterministic rotation)
  dailyArtRouter.get('/', isAuthenticated, async (_req: Request, res: Response) => {
    const now = new Date();
    const dateStr = toDateString(now);
    const cacheKey = `daily-art:${dateStr}`;

    // Try cache first
    if (cacheService) {
      const cached = await cacheService.get<Artwork>(cacheKey);
      if (cached) {
        res.json({ artwork: cached });
        return;
      }
    }

    const artwork = selectArtworkForDate(now);

    // Store in cache if available
    if (cacheService) {
      await cacheService.set(cacheKey, artwork, CACHE_TTL_SECONDS);
    }

    res.json({ artwork });
  });

  return dailyArtRouter;
};
