import { Router } from 'express';

import { AppError, badRequest } from '@shared/errors/app.error';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';

import { getRequestUser } from './chat-route.helpers';

import type { UserMemoryService } from '../../../useCase/user-memory.service';

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
  router.patch('/memory/preference', isAuthenticated, async (req, res) => {
    const currentUser = getRequestUser(req);
    if (!currentUser?.id) {
      throw new AppError({ message: 'Token required', statusCode: 401, code: 'UNAUTHORIZED' });
    }

    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      throw badRequest('enabled must be a boolean');
    }

    await userMemoryService.setDisabledByUser(currentUser.id, !enabled);
    res.status(200).json({ enabled });
  });

  return router;
};
