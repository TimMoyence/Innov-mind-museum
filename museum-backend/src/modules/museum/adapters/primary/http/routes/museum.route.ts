import { type Request, type Response, Router } from 'express';

import { auditService } from '@shared/audit';
import { badRequest } from '@shared/errors/app.error';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { byUserId, createRateLimitMiddleware } from '@src/helpers/middleware/rate-limit.middleware';
import { requireRole } from '@src/helpers/middleware/require-role.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';
import { validateQuery } from '@src/helpers/middleware/validate-query.middleware';

import {
  buildSearchMuseumsUseCase,
  createMuseumUseCase,
  getMuseumUseCase,
  listMuseumsUseCase,
  updateMuseumUseCase,
} from '../../../../useCase';
import {
  createMuseumSchema,
  getEnrichmentQuerySchema,
  getEnrichmentStatusQuerySchema,
  searchMuseumsQuerySchema,
  updateMuseumSchema,
} from '../schemas/museum.schemas';

import type { MuseumDirectoryDTO, UpdateMuseumInput } from '../../../../domain/museum/museum.types';
import type { EnrichMuseumUseCase } from '../../../../useCase/enrichment/enrichMuseum.useCase';
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
    museumType: m.museumType,
  }));
  res.json({ museums: directory });
};

/** Creates the handler for GET /api/museums/search. */
const buildHandleSearch = (searchMuseumsUseCase: ReturnType<typeof buildSearchMuseumsUseCase>) => {
  return async (_req: Request, res: Response) => {
    const { lat, lng, radius, q, bbox } = res.locals.validatedQuery as {
      lat?: number;
      lng?: number;
      radius?: number;
      q?: string;
      bbox?: string;
    };

    const parsedBbox = bbox
      ? (bbox.split(',').map(Number) as [number, number, number, number])
      : undefined;

    const result = await searchMuseumsUseCase.execute({
      lat,
      lng,
      radiusMeters: radius,
      q,
      bbox: parsedBbox,
    });

    res.json(result);
  };
};

/** Handler: POST /api/museums — create a museum (admin only). */
const handleCreateMuseum = async (req: Request, res: Response) => {
  const { name, slug, address, description, config, museumType } = req.body as {
    name: string;
    slug: string;
    address?: string;
    description?: string;
    config?: Record<string, unknown>;
    museumType?: string;
  };
  const museum = await createMuseumUseCase.execute({
    name,
    slug,
    address,
    description,
    config,
    ...(museumType
      ? { museumType: museumType as 'art' | 'history' | 'science' | 'specialized' | 'general' }
      : {}),
  });
  await auditService.log({
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

/** Parses numeric `:id` param or throws 400. Shared by enrichment handlers. */
const parseMuseumIdParam = (raw: string): number => {
  const id = Number.parseInt(raw, 10);
  if (Number.isNaN(id) || id <= 0) throw badRequest('Invalid museum ID');
  return id;
};

/** Creates the handler for GET /api/museums/:id/enrichment. */
const buildHandleGetEnrichment = (useCase: EnrichMuseumUseCase) => {
  return async (req: Request, res: Response) => {
    const museumId = parseMuseumIdParam(req.params.id);
    const { locale } = res.locals.validatedQuery as { locale: string };
    const result = await useCase.execute({ museumId, locale });
    res.status(result.status === 'ready' ? 200 : 202).json(result);
  };
};

/** Creates the handler for GET /api/museums/:id/enrichment/status. */
const buildHandleGetEnrichmentStatus = (useCase: EnrichMuseumUseCase) => {
  return async (req: Request, res: Response) => {
    const museumId = parseMuseumIdParam(req.params.id);
    const { locale, jobId } = res.locals.validatedQuery as { locale: string; jobId: string };
    const result = await useCase.getJobStatus({ museumId, locale, jobId });
    res.status(result.status === 'ready' ? 200 : 202).json(result);
  };
};

/** Handler: PUT /api/museums/:id — update museum (admin only). */
const handleUpdateMuseum = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw badRequest('Invalid museum ID');
  const museum = await updateMuseumUseCase.execute(id, req.body as UpdateMuseumInput);
  await auditService.log({
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

/** Dependencies accepted by {@link createMuseumRouter}. */
export interface CreateMuseumRouterDeps {
  cacheService?: CacheService;
  /** When undefined, the two `/enrichment` endpoints return 503. */
  enrichMuseumUseCase?: EnrichMuseumUseCase;
}

/**
 * Builds the museum Express router with all CRUD, search, and hybrid
 * enrichment endpoints.
 *
 * @param deps - Optional injected dependencies (cache + enrichment use case).
 * @returns Configured Express Router.
 */
export const createMuseumRouter = (deps: CreateMuseumRouterDeps = {}): Router => {
  const museumRouter: Router = Router();

  const searchMuseumsUseCase = buildSearchMuseumsUseCase(deps.cacheService);

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

  if (deps.enrichMuseumUseCase) {
    museumRouter.get(
      '/:id/enrichment',
      isAuthenticated,
      validateQuery(getEnrichmentQuerySchema),
      buildHandleGetEnrichment(deps.enrichMuseumUseCase),
    );
    museumRouter.get(
      '/:id/enrichment/status',
      isAuthenticated,
      validateQuery(getEnrichmentStatusQuerySchema),
      buildHandleGetEnrichmentStatus(deps.enrichMuseumUseCase),
    );
  }

  return museumRouter;
};
