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
import { requireUser } from '@shared/http/requireUser';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';
import { validateQuery } from '@shared/middleware/validate-query.middleware';

import type { ReviewAuthorProfile } from '@modules/review/useCase/public/createReview.useCase';

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

export interface CreateReviewRouterDeps {
  authorResolver?: ReviewAuthorResolver;
}

export const createReviewRouter = (deps: CreateReviewRouterDeps = {}): Router => {
  const reviewRouter: Router = Router();
  const resolveAuthor = deps.authorResolver ?? defaultAuthorResolver;

  // SEC: userName is derived server-side from the authenticated user's profile
  // (never accepted from client) to prevent impersonation / spoofing.
  reviewRouter.post(
    '/',
    isAuthenticated,
    validateBody(createReviewSchema),
    async (req: Request, res: Response) => {
      const authedUser = requireUser(req);

      const { rating, comment, sessionId } = req.body as {
        rating: number;
        comment: string;
        sessionId?: string;
      };

      const author = await resolveAuthor(authedUser.id);
      if (!author) {
        throw unauthorized('User authentication required');
      }

      // NPS attribution (C2 / R1-R4 / Q1) — thread the VISITED session, NOT the
      // author's tenant claim. The use-case resolves the session (ownership-
      // checked) and derives `museum_id`. Absent / foreign session → NULL
      // museum (global / public review). `authedUser.museumId` is deliberately
      // never read here (R4 — it would mis-attribute a manager's reviews).
      const review = await createReviewUseCase.execute({
        user: author,
        rating,
        comment,
        sessionId,
      });

      res.status(201).json({ review });
    },
  );

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

  reviewRouter.get('/stats', async (_req: Request, res: Response) => {
    const stats = await getReviewStatsUseCase.execute();
    res.json(stats);
  });

  return reviewRouter;
};

const reviewRouter: Router = createReviewRouter();

export default reviewRouter;
