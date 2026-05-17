import { Router } from 'express';
import { z } from 'zod';

import { getRequestUser } from '@modules/chat/adapters/primary/http/helpers/chat-route.helpers';
import { AppError } from '@shared/errors/app.error';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';

import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';

const memoryPreferenceSchema = z.object({
  enabled: z.boolean(),
});

export const createMemoryRouter = (userMemoryService: UserMemoryService): Router => {
  const router = Router();

  router.get('/memory/preference', isAuthenticated, async (req, res) => {
    const currentUser = getRequestUser(req);
    if (!currentUser?.id) {
      throw new AppError({ message: 'Token required', statusCode: 401, code: 'UNAUTHORIZED' });
    }

    const disabled = await userMemoryService.isDisabledByUser(currentUser.id);
    res.status(200).json({ enabled: !disabled });
  });

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
