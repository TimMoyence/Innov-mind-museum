import { type Request, type Response, Router } from 'express';

import { userRepository } from '@modules/auth/useCase';
import {
  createReviewSchema,
  listReviewsQuerySchema,
} from '@modules/review/adapters/primary/http/schemas/review.schemas';
import {
  createReviewUseCase,
  listApprovedReviewsUseCase,
  getReviewStatsUseCase,
} from '@modules/review/useCase';
import { unauthorized } from '@shared/errors/app.error';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';
import { validateQuery } from '@src/helpers/middleware/validate-query.middleware';

import type { ReviewAuthorProfile } from '@modules/review/useCase/public/createReview.useCase';

/** Resolves the author profile used to derive the review display name. */
export type ReviewAuthorResolver = (userId: number) => Promise<ReviewAuthorProfile | null>;

const defaultAuthorResolver: ReviewAuthorResolver = async (userId) => {
  const user = await userRepository.getUserById(userId);
  if (!user) return null;
  return {
    id: user.id,
    firstname: user.firstname,
    lastname: user.lastname,
  };
};

/** Dependencies for the review router — accepts an optional author resolver for tests. */
export interface CreateReviewRouterDeps {
  authorResolver?: ReviewAuthorResolver;
}

/**
 * Builds the review Express router.
 *
 * @param deps - Optional injected dependencies (author profile resolver).
 * @returns Configured Express Router.
 */
export const createReviewRouter = (deps: CreateReviewRouterDeps = {}): Router => {
  const reviewRouter: Router = Router();
  const resolveAuthor = deps.authorResolver ?? defaultAuthorResolver;

  // POST /api/reviews — Authenticated user: create a review.
  // userName is NOT accepted from the client — it is derived server-side from
  // the authenticated user's profile to prevent impersonation / spoofing.
  reviewRouter.post(
    '/',
    isAuthenticated,
    validateBody(createReviewSchema),
    async (req: Request, res: Response) => {
      if (!req.user?.id) {
        throw unauthorized('User authentication required');
      }

      const { rating, comment } = req.body as {
        rating: number;
        comment: string;
      };

      const author = await resolveAuthor(req.user.id);
      if (!author) {
        throw unauthorized('User authentication required');
      }

      const review = await createReviewUseCase.execute({
        user: author,
        rating,
        comment,
      });

      res.status(201).json({ review });
    },
  );

  // GET /api/reviews — Public: list approved reviews (paginated)
  reviewRouter.get(
    '/',
    validateQuery(listReviewsQuerySchema),
    async (_req: Request, res: Response) => {
      const { page, limit } = res.locals.validatedQuery as { page: number; limit: number };

      const result = await listApprovedReviewsUseCase.execute({
        page,
        limit,
      });

      res.json(result);
    },
  );

  // GET /api/reviews/stats — Public: get average rating + count
  reviewRouter.get('/stats', async (_req: Request, res: Response) => {
    const stats = await getReviewStatsUseCase.execute();
    res.json(stats);
  });

  return reviewRouter;
};

/** Default review router instance (uses PG-backed author resolver). */
const reviewRouter: Router = createReviewRouter();

export default reviewRouter;
