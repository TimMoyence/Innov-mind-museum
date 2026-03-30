import { Router } from 'express';

import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';

import { artworks } from './artworks.data';

import type { Artwork } from './artworks.data';
import type { CacheService } from '@shared/cache/cache.port';
import type { NextFunction, Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the day-of-year (1-366) for a given date.
 */
const getDayOfYear = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1_000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

/**
 * Returns a `YYYY-MM-DD` date string used as the cache key suffix.
 */
const toDateString = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Selects today's artwork from the curated list using deterministic rotation.
 */
export const selectArtworkForDate = (date: Date): Artwork => {
  const dayOfYear = getDayOfYear(date);
  return artworks[dayOfYear % artworks.length];
};

// Re-export for tests
export { artworks } from './artworks.data';
export type { Artwork } from './artworks.data';

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

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
  dailyArtRouter.get(
    '/',
    isAuthenticated,
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
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
      } catch (error) {
        next(error);
      }
    },
  );

  return dailyArtRouter;
};
