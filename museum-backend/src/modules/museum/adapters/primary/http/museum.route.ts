import { type NextFunction, type Request, type Response, Router } from 'express';

import { auditService } from '@shared/audit';
import { badRequest } from '@shared/errors/app.error';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { requireRole } from '@src/helpers/middleware/require-role.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';

import { createMuseumSchema, updateMuseumSchema } from './museum.schemas';
import {
  createMuseumUseCase,
  getMuseumUseCase,
  listMuseumsUseCase,
  updateMuseumUseCase,
} from '../../../core/useCase';

import type { MuseumDirectoryDTO, UpdateMuseumInput } from '../../../core/domain/museum.types';

const museumRouter: Router = Router();

// GET /api/museums/directory — Authenticated: public directory of active museums
museumRouter.get('/directory', isAuthenticated, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const museums = await listMuseumsUseCase.execute({ activeOnly: true });
    const directory: MuseumDirectoryDTO[] = museums.map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      address: m.address ?? null,
      description: m.description ?? null,
      latitude: m.latitude ?? null,
      longitude: m.longitude ?? null,
    }));
    res.json({ museums: directory });
  } catch (error) { next(error); }
});

// POST /api/museums — Admin only: create museum
museumRouter.post('/', isAuthenticated, requireRole('admin'), validateBody(createMuseumSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, slug, address, description, config } = req.body as {
      name: string; slug: string; address?: string; description?: string; config?: Record<string, unknown>;
    };
    const museum = await createMuseumUseCase.execute({ name, slug, address, description, config });
    auditService.log({
      action: 'MUSEUM_CREATED',
      actorType: 'user',
      actorId: req.user?.id ?? null,
      targetType: 'museum',
      targetId: String(museum.id),
      metadata: { name, slug },
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(201).json({ museum });
  } catch (error) { next(error); }
});

// GET /api/museums — Admin/moderator: list museums
museumRouter.get('/', isAuthenticated, requireRole('admin', 'moderator', 'museum_manager'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const museums = await listMuseumsUseCase.execute();
    res.json({ museums });
  } catch (error) { next(error); }
});

// GET /api/museums/:idOrSlug — Authenticated: get by id or slug
museumRouter.get('/:idOrSlug', isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const museum = await getMuseumUseCase.execute(req.params.idOrSlug);
    res.json({ museum });
  } catch (error) { next(error); }
});

// PUT /api/museums/:id — Admin: update museum
museumRouter.put('/:id', isAuthenticated, requireRole('admin'), validateBody(updateMuseumSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw badRequest('Invalid museum ID');
    const museum = await updateMuseumUseCase.execute(id, req.body as UpdateMuseumInput);
    auditService.log({
      action: 'MUSEUM_UPDATED',
      actorType: 'user',
      actorId: req.user?.id ?? null,
      targetType: 'museum',
      targetId: String(id),
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({ museum });
  } catch (error) { next(error); }
});

export default museumRouter;
