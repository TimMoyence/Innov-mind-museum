import { type Request, type Response, Router } from 'express';
import { z } from 'zod';

import { auditService } from '@shared/audit';
import { notFound } from '@shared/errors/app.error';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { requireRole } from '@src/helpers/middleware/require-role.middleware';
import { validateQuery } from '@src/helpers/middleware/validate-query.middleware';

import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';

const pendingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Builds the admin knowledge-extraction review router.
 * Closes the loop on ArtworkKnowledge entries flagged with needsReview=true.
 */
export function createAdminKeRouter(repo: ArtworkKnowledgeRepoPort): Router {
  const router = Router();

  // GET /api/admin/ke/pending — list items awaiting human review
  router.get(
    '/ke/pending',
    isAuthenticated,
    requireRole('admin', 'moderator'),
    validateQuery(pendingQuerySchema),
    async (_req: Request, res: Response) => {
      const { limit } = res.locals.validatedQuery as z.infer<typeof pendingQuerySchema>;
      const items = await repo.findNeedsReview(limit);
      res.json({ items, count: items.length });
    },
  );

  // PATCH /api/admin/ke/:id/approve — clear needsReview flag
  router.patch(
    '/ke/:id/approve',
    isAuthenticated,
    requireRole('admin', 'moderator'),
    async (req: Request, res: Response) => {
      const { id } = req.params;
      const adminId = req.user?.id ?? null;

      const item = await repo.approve(id);
      if (!item) {
        throw notFound(`ArtworkKnowledge ${id}`);
      }

      if (adminId) {
        await auditService.log({
          action: 'KE_ARTWORK_APPROVED',
          actorType: 'user',
          actorId: adminId,
          targetType: 'artwork_knowledge',
          targetId: id,
          ip: req.ip,
          requestId: req.requestId,
        });
      }

      res.json({ id: item.id, title: item.title, needsReview: item.needsReview });
    },
  );

  return router;
}
