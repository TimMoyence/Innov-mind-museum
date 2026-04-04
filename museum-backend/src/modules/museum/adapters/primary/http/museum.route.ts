import { type Request, type Response, Router } from 'express';

import { auditService } from '@shared/audit';
import { badRequest } from '@shared/errors/app.error';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { byUserId, createRateLimitMiddleware } from '@src/helpers/middleware/rate-limit.middleware';
import { requireRole } from '@src/helpers/middleware/require-role.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';
import { validateQuery } from '@src/helpers/middleware/validate-query.middleware';

import { createMuseumSchema, searchMuseumsQuerySchema, updateMuseumSchema } from './museum.schemas';
import {
  buildSearchMuseumsUseCase,
  createMuseumUseCase,
  getMuseumUseCase,
  listMuseumsUseCase,
  updateMuseumUseCase,
} from '../../../useCase';

import type { MuseumDirectoryDTO, UpdateMuseumInput } from '../../../domain/museum.types';
import type { CacheService } from '@shared/cache/cache.port';

/** Handler: GET /api/museums/directory — public directory of active museums. */
const handleGetDirectory = async (_req: Request, res: Response) => {
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
};

/** Creates the handler for GET /api/museums/search. */
const buildHandleSearch = (searchMuseumsUseCase: ReturnType<typeof buildSearchMuseumsUseCase>) => {
  return async (_req: Request, res: Response) => {
    const { lat, lng, radius, q } = res.locals.validatedQuery as {
      lat?: number;
      lng?: number;
      radius?: number;
      q?: string;
    };

    const result = await searchMuseumsUseCase.execute({
      lat,
      lng,
      radiusMeters: radius,
      q,
    });

    res.json(result);
  };
};

/** Handler: POST /api/museums — create a museum (admin only). */
const handleCreateMuseum = async (req: Request, res: Response) => {
  const { name, slug, address, description, config } = req.body as {
    name: string;
    slug: string;
    address?: string;
    description?: string;
    config?: Record<string, unknown>;
  };
  const museum = await createMuseumUseCase.execute({
    name,
    slug,
    address,
    description,
    config,
  });
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
};

/** Handler: GET /api/museums — list all museums (admin/moderator). */
const handleListMuseums = async (_req: Request, res: Response) => {
  const museums = await listMuseumsUseCase.execute();
  res.json({ museums });
};

/** Handler: GET /api/museums/:idOrSlug — get museum by id or slug. */
const handleGetMuseum = async (req: Request, res: Response) => {
  const museum = await getMuseumUseCase.execute(req.params.idOrSlug);
  res.json({ museum });
};

/** Handler: PUT /api/museums/:id — update museum (admin only). */
const handleUpdateMuseum = async (req: Request, res: Response) => {
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
};

/**
 * Builds the museum Express router with all CRUD and search endpoints.
 *
 * @param cacheService - Optional cache service for Overpass API result caching.
 * @returns Configured Express Router.
 */
export const createMuseumRouter = (cacheService?: CacheService): Router => {
  const museumRouter: Router = Router();

  const searchMuseumsUseCase = buildSearchMuseumsUseCase(cacheService);

  const searchLimiter = createRateLimitMiddleware({
    limit: 15,
    windowMs: 60_000,
    keyGenerator: byUserId,
  });

  museumRouter.get('/directory', isAuthenticated, handleGetDirectory);
  museumRouter.get(
    '/search',
    isAuthenticated,
    searchLimiter,
    validateQuery(searchMuseumsQuerySchema),
    buildHandleSearch(searchMuseumsUseCase),
  );
  museumRouter.post(
    '/',
    isAuthenticated,
    requireRole('admin'),
    validateBody(createMuseumSchema),
    handleCreateMuseum,
  );
  museumRouter.get(
    '/',
    isAuthenticated,
    requireRole('admin', 'moderator', 'museum_manager'),
    handleListMuseums,
  );
  museumRouter.get('/:idOrSlug', isAuthenticated, handleGetMuseum);
  museumRouter.put(
    '/:id',
    isAuthenticated,
    requireRole('admin'),
    validateBody(updateMuseumSchema),
    handleUpdateMuseum,
  );

  return museumRouter;
};
