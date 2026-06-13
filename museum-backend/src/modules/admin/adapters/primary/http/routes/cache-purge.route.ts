import { type Request, type Response, Router } from 'express';

import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm/llm-cache.service';
import { auditService } from '@shared/audit';
import { badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import { requireRole } from '@shared/middleware/require-role.middleware';

import type { CacheService } from '@shared/cache/cache.port';

/**
 * I-FIX1 (2026-05-21) — wires the admin "purge museum cache" button onto
 * `LlmCacheServiceImpl.invalidateMuseum`, which iterates `museum-mode` +
 * `personalized` contextClasses with the REAL key namespace
 * `llm:{KEY_VERSION}:{contextClass}:{museumId}:`. The previous implementation called
 * `delByPrefix('chat:llm:${museumId}:')`, a namespace that matches 0
 * production cache entries — admin edits would leave stale responses in the
 * cache for up to 24h (museum-mode TTL).
 *
 * Wiring decision (D-IFIX1) :
 *   The frozen integration test (`tests/integration/admin/cache-purge.namespace.test.ts`)
 *   instantiates the router with a single `CacheService` arg. To honour that
 *   contract while still delegating to `invalidateMuseum`, we construct the
 *   `LlmCacheServiceImpl` INSIDE this composition root from the injected
 *   `cache`. The service has no other dependencies (constructor takes only
 *   `CacheService`), and the production `delByPrefix` calls flow through the
 *   SAME `cache` instance — so the versioned prefix is invalidated exactly once per
 *   contextClass with no surface-area drift. This also resurrects
 *   `invalidateMuseum` from dead-code (UFR-016 R-IFIX1b — caller exists).
 */
export function createCachePurgeRouter(cache: CacheService): Router {
  const router = Router();
  const llmCacheService = new LlmCacheServiceImpl(cache);

  router.post(
    '/museums/:id/cache/purge',
    isAuthenticated,
    requireRole('admin'),
    async (req: Request, res: Response) => {
      const museumIdStr = parseStringParam(req, 'id');
      if (!museumIdStr) throw badRequest('museum id param is required');
      // I-FIX1 — validate integer. `invalidateMuseum(museumId: number)` is
      // typed and the key layout uses `String(museumId)` segment, so any
      // non-integer here would either silently target the wrong namespace or
      // (worse) coerce to NaN and call `delByPrefix('llm:{KEY_VERSION}:museum-mode:NaN:')`.
      // Defence-in-depth : reject early with 400.
      const museumIdInt = Number.parseInt(museumIdStr, 10);
      if (
        !Number.isInteger(museumIdInt) ||
        museumIdInt < 1 ||
        String(museumIdInt) !== museumIdStr
      ) {
        throw badRequest('museum id must be a positive integer');
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
