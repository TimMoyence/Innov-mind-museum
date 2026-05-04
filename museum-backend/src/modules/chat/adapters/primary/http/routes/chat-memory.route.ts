import { Router } from 'express';
import { z } from 'zod';

import { getRequestUser } from '@modules/chat/adapters/primary/http/helpers/chat-route.helpers';
import { AppError } from '@shared/errors/app.error';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';

import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';

const memoryPreferenceSchema = z.object({
  enabled: z.boolean(),
});

/**
 * Creates the memory-preference sub-router.
 *
 * @param userMemoryService - Injected user memory service.
 * @returns Router handling GET/PATCH /memory/preference.
 */
export const createMemoryRouter = (userMemoryService: UserMemoryService): Router => {
  const router = Router();

  // GET /memory/preference — returns current memory opt-out state
  router.get('/memory/preference', isAuthenticated, async (req, res) => {
    const currentUser = getRequestUser(req);
    if (!currentUser?.id) {
      throw new AppError({ message: 'Token required', statusCode: 401, code: 'UNAUTHORIZED' });
    }

    const disabled = await userMemoryService.isDisabledByUser(currentUser.id);
    res.status(200).json({ enabled: !disabled });
  });

  // PATCH /memory/preference — toggle memory opt-out
  router.patch(
    '/memory/preference',
    isAuthenticated,
    validateBody(memoryPreferenceSchema),
    async (req, res) => {
      const currentUser = getRequestUser(req);
      if (!currentUser?.id) {
        throw new AppError({ message: 'Token required', statusCode: 401, code: 'UNAUTHORIZED' });
      }

      const { enabled } = req.body as z.infer<typeof memoryPreferenceSchema>;
      await userMemoryService.setDisabledByUser(currentUser.id, !enabled);
      res.status(200).json({ enabled });
    },
  );

  return router;
};
