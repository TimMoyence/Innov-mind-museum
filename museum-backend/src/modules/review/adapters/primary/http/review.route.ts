import { type NextFunction, type Request, type Response, Router } from 'express';

import { unauthorized } from '@shared/errors/app.error';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';
import { validateQuery } from '@src/helpers/middleware/validate-query.middleware';

import { createReviewSchema, listReviewsQuerySchema } from './review.schemas';
import {
  createReviewUseCase,
  listApprovedReviewsUseCase,
  getReviewStatsUseCase,
} from '../../../useCase';

const reviewRouter: Router = Router();

// POST /api/reviews — Authenticated user: create a review
reviewRouter.post(
  '/',
  isAuthenticated,
  validateBody(createReviewSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        throw unauthorized('User authentication required');
      }

      const { rating, comment, userName } = req.body as {
        rating: number;
        comment: string;
        userName: string;
      };

      const review = await createReviewUseCase.execute({
        userId: req.user.id,
        userName,
        rating,
        comment,
      });

      res.status(201).json({ review });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/reviews — Public: list approved reviews (paginated)
reviewRouter.get(
  '/',
  validateQuery(listReviewsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit } = req.query as unknown as { page: number; limit: number };

      const result = await listApprovedReviewsUseCase.execute({
        page,
        limit,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/reviews/stats — Public: get average rating + count
reviewRouter.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getReviewStatsUseCase.execute();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

export default reviewRouter;
