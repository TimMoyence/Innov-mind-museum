/**
 * Mutation-coverage tests for ListApprovedReviewsUseCase.
 *
 * Targets 3 Stryker survivors in `src/modules/review/useCase/public/listApprovedReviews.useCase.ts`:
 *  - L22 ConditionalExpression on full limit check → `false`
 *  - L22 LogicalOperator `!Number.isInteger(input.limit) || input.limit < 1` → `&&`
 *  - L22 ConditionalExpression on `input.limit < 1` → `false`
 *
 * Strategy: assert that BOTH a non-integer limit AND a limit<1 each independently
 * trigger badRequest (killing the `||→&&` mutant), assert boundaries (limit=1
 * accepted, limit=0/101 rejected), and assert the full filters payload sent to
 * the repo so the status='approved' literal is locked too.
 */

import { ListApprovedReviewsUseCase } from '@modules/review/useCase/public/listApprovedReviews.useCase';

import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type { ReviewDTO } from '@modules/review/domain/review/review.types';
import type { PaginatedResult } from '@shared/types/pagination';

const approvedReview: ReviewDTO = {
  id: '00000000-0000-0000-0000-000000000100',
  userId: 9,
  userName: 'Approved User',
  rating: 5,
  comment: 'Approved comment text.',
  status: 'approved',
  museumId: null,
  createdAt: '2026-03-26T12:00:00.000Z',
};

function makeRepo(): jest.Mocked<IReviewRepository> {
  const page: PaginatedResult<ReviewDTO> = {
    data: [approvedReview],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  };
  return {
    createReview: jest.fn().mockResolvedValue(approvedReview),
    listReviews: jest.fn().mockResolvedValue(page),
    getReviewById: jest.fn().mockResolvedValue(null),
    moderateReview: jest.fn().mockResolvedValue(null),
    getAverageRating: jest.fn().mockResolvedValue({ average: 0, count: 0 }),
    listForUser: jest.fn().mockResolvedValue([]),
    findByMuseum: jest.fn().mockResolvedValue(page),
    aggregateNps: jest
      .fn()
      .mockResolvedValue({ nps: 0, promoters: 0, passives: 0, detractors: 0, count: 0 }),
  };
}

describe('ListApprovedReviewsUseCase — mutation coverage', () => {
  describe('limit validation (L22 ConditionalExpression / LogicalOperator)', () => {
    it('rejects a NON-INTEGER limit that is otherwise in [1, 100] — kills `||→&&` mutant', async () => {
      // limit = 1.5 satisfies `limit < 1` → false but `!Number.isInteger` → true.
      // Under the `&&` mutant both must be true, so 1.5 would slip through.
      const repo = makeRepo();
      const uc = new ListApprovedReviewsUseCase(repo);
      await expect(uc.execute({ page: 1, limit: 1.5 })).rejects.toThrow(
        'limit must be between 1 and 100',
      );
      expect(repo.listReviews).not.toHaveBeenCalled();
    });

    it('rejects limit === 0 (integer, < 1) — kills `&&` mutant from the other side', async () => {
      // limit = 0 satisfies `limit < 1` → true but `!Number.isInteger` → false.
      // Under the `&&` mutant the guard becomes false → no badRequest → mutant survives.
      const repo = makeRepo();
      const uc = new ListApprovedReviewsUseCase(repo);
      await expect(uc.execute({ page: 1, limit: 0 })).rejects.toThrow(
        'limit must be between 1 and 100',
      );
      expect(repo.listReviews).not.toHaveBeenCalled();
    });

    it('rejects limit === -3 (integer, < 1)', async () => {
      const repo = makeRepo();
      const uc = new ListApprovedReviewsUseCase(repo);
      await expect(uc.execute({ page: 1, limit: -3 })).rejects.toThrow(
        'limit must be between 1 and 100',
      );
      expect(repo.listReviews).not.toHaveBeenCalled();
    });

    it('accepts limit === 1 (boundary)', async () => {
      const repo = makeRepo();
      const uc = new ListApprovedReviewsUseCase(repo);
      await uc.execute({ page: 1, limit: 1 });
      expect(repo.listReviews).toHaveBeenCalledTimes(1);
      expect(repo.listReviews).toHaveBeenCalledWith({
        status: 'approved',
        pagination: { page: 1, limit: 1 },
      });
    });

    it('accepts limit === 100 (upper boundary)', async () => {
      const repo = makeRepo();
      const uc = new ListApprovedReviewsUseCase(repo);
      await uc.execute({ page: 1, limit: 100 });
      expect(repo.listReviews).toHaveBeenCalledTimes(1);
      expect(repo.listReviews).toHaveBeenCalledWith({
        status: 'approved',
        pagination: { page: 1, limit: 100 },
      });
    });

    it('rejects limit === 101 (just above upper bound)', async () => {
      const repo = makeRepo();
      const uc = new ListApprovedReviewsUseCase(repo);
      await expect(uc.execute({ page: 1, limit: 101 })).rejects.toThrow(
        'limit must be between 1 and 100',
      );
      expect(repo.listReviews).not.toHaveBeenCalled();
    });
  });

  describe('happy path payload locks status=approved literal', () => {
    it('forwards page, limit, and status=approved to the repository verbatim', async () => {
      const repo = makeRepo();
      const uc = new ListApprovedReviewsUseCase(repo);
      const result = await uc.execute({ page: 3, limit: 25 });

      expect(repo.listReviews).toHaveBeenCalledTimes(1);
      expect(repo.listReviews).toHaveBeenCalledWith({
        status: 'approved',
        pagination: { page: 3, limit: 25 },
      });
      expect(result).toMatchObject({
        data: [approvedReview],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });
  });
});
