import { Router } from 'express';
import { z } from 'zod';

import { requireUser } from '@shared/http/requireUser';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';

import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';

const memoryPreferenceSchema = z.object({
  enabled: z.boolean(),
});

export const createMemoryRouter = (userMemoryService: UserMemoryService): Router => {
  const router = Router();

  router.get('/memory/preference', isAuthenticated, async (req, res) => {
    const user = requireUser(req);

    const disabled = await userMemoryService.isDisabledByUser(user.id);
    res.status(200).json({ enabled: !disabled });
  });

  router.patch(
    '/memory/preference',
    isAuthenticated,
    validateBody(memoryPreferenceSchema),
    async (req, res) => {
      const user = requireUser(req);

      const { enabled } = req.body as z.infer<typeof memoryPreferenceSchema>;
      await userMemoryService.setDisabledByUser(user.id, !enabled);
      res.status(200).json({ enabled });
    },
  );

  return router;
};
