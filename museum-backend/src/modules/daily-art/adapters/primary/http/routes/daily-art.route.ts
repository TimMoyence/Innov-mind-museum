import { Router } from 'express';

import {
  selectArtworkForDate,
  toDateString,
} from '@modules/daily-art/useCase/getDailyArtwork.useCase';
import { resolveLocale } from '@shared/i18n/locale';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';

import type { DailyArtworkDTO } from '@modules/daily-art/domain/artwork.types';
import type { CacheService } from '@shared/cache/cache.port';
import type { Request, Response } from 'express';

const CACHE_TTL_SECONDS = 86_400; // 24 hours

export const createDailyArtRouter = (cacheService?: CacheService): Router => {
  const dailyArtRouter: Router = Router();

  // GET /api/daily-art — returns 1 artwork per day (deterministic rotation),
  // localized to the requested locale (query `?locale=` then Accept-Language).
  dailyArtRouter.get('/', isAuthenticated, async (req: Request, res: Response) => {
    // `req.query.locale` is `string | string[] | ParsedQs | undefined`; only a
    // plain string is a meaningful locale candidate (resolveLocale ignores the rest).
    const localeQuery = typeof req.query.locale === 'string' ? req.query.locale : undefined;
    const locale = resolveLocale([localeQuery, req.headers['accept-language']]);
    const now = new Date();
    const dateStr = toDateString(now);
    const cacheKey = `daily-art:${dateStr}:${locale}`;

    if (cacheService) {
      const cached = await cacheService.get<DailyArtworkDTO>(cacheKey);
      if (cached) {
        res.json({ artwork: cached });
        return;
      }
    }

    const artwork = selectArtworkForDate(now, locale);

    if (cacheService) {
      await cacheService.set(cacheKey, artwork, CACHE_TTL_SECONDS);
    }

    res.json({ artwork });
  });

  return dailyArtRouter;
};
