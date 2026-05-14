/**
 * Mutation-coverage tests for ListAllReviewsUseCase.
 *
 * Targets 5 Stryker survivors in `src/modules/review/useCase/admin/listAllReviews.useCase.ts`:
 *  - L28 ConditionalExpression `input.limit < 1` → `false`
 *  - L28 EqualityOperator `input.limit < 1` → `<= 1`
 *  - L28 ConditionalExpression `input.limit > 100` → `false`
 *  - L28 EqualityOperator `input.limit > 100` → `>= 100`
 *  - L33 StringLiteral `', '` → `""` (REVIEW_STATUSES.join separator)
 *
 * Strategy: boundary tests for limit=1, limit=100, limit=0, limit=101, and an
 * exact string assertion on the join-separator in the bad-status error message.
 */

import { ListAllReviewsUseCase } from '@modules/review/useCase/admin/listAllReviews.useCase';

import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type { ReviewDTO } from '@modules/review/domain/review/review.types';
import type { PaginatedResult } from '@shared/types/pagination';

const sampleReview: ReviewDTO = {
  id: '00000000-0000-0000-0000-000000000010',
  userId: 5,
  userName: 'Sample',
  rating: 4,
  comment: 'Sample comment here.',
  status: 'pending',
  createdAt: '2026-03-26T12:00:00.000Z',
};

function makeRepo(): jest.Mocked<IReviewRepository> {
  const page: PaginatedResult<ReviewDTO> = {
    data: [sampleReview],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  };
  return {
    createReview: jest.fn().mockResolvedValue(sampleReview),
    listReviews: jest.fn().mockResolvedValue(page),
    getReviewById: jest.fn().mockResolvedValue(null),
    moderateReview: jest.fn().mockResolvedValue(null),
    getAverageRating: jest.fn().mockResolvedValue({ average: 0, count: 0 }),
    listForUser: jest.fn().mockResolvedValue([]),
  };
}

describe('ListAllReviewsUseCase — mutation coverage', () => {
  describe('limit lower bound (L28 ConditionalExpression / EqualityOperator `< 1`)', () => {
    it('accepts limit === 1 (boundary)', async () => {
      const repo = makeRepo();
      const uc = new ListAllReviewsUseCase(repo);
      const result = await uc.execute({ page: 1, limit: 1 });

      expect(repo.listReviews).toHaveBeenCalledTimes(1);
      expect(repo.listReviews).toHaveBeenCalledWith({
        status: undefined,
        pagination: { page: 1, limit: 1 },
      });
      expect(result.data).toHaveLength(1);
    });

    it('rejects limit === 0', async () => {
      const repo = makeRepo();
      const uc = new ListAllReviewsUseCase(repo);
      await expect(uc.execute({ page: 1, limit: 0 })).rejects.toThrow(
        'limit must be between 1 and 100',
      );
      expect(repo.listReviews).not.toHaveBeenCalled();
    });
  });

  describe('limit upper bound (L28 ConditionalExpression / EqualityOperator `> 100`)', () => {
    it('accepts limit === 100 (boundary)', async () => {
      const repo = makeRepo();
      const uc = new ListAllReviewsUseCase(repo);
      await uc.execute({ page: 1, limit: 100 });

      expect(repo.listReviews).toHaveBeenCalledTimes(1);
      expect(repo.listReviews).toHaveBeenCalledWith({
        status: undefined,
        pagination: { page: 1, limit: 100 },
      });
    });

    it('rejects limit === 101', async () => {
      const repo = makeRepo();
      const uc = new ListAllReviewsUseCase(repo);
      await expect(uc.execute({ page: 1, limit: 101 })).rejects.toThrow(
        'limit must be between 1 and 100',
      );
      expect(repo.listReviews).not.toHaveBeenCalled();
    });
  });

  describe('invalid status error message (L33 StringLiteral `, ` join separator)', () => {
    it('throws with the exact comma-space-joined enumeration of allowed statuses', async () => {
      const repo = makeRepo();
      const uc = new ListAllReviewsUseCase(repo);
      await expect(uc.execute({ page: 1, limit: 20, status: 'bogus' })).rejects.toThrow(
        'status must be one of: pending, approved, rejected',
      );
      expect(repo.listReviews).not.toHaveBeenCalled();
    });
  });

  describe('happy path (full payload assertion)', () => {
    it('forwards page, limit, and status filter to the repository verbatim', async () => {
      const repo = makeRepo();
      const uc = new ListAllReviewsUseCase(repo);
      const result = await uc.execute({ page: 2, limit: 50, status: 'approved' });

      expect(repo.listReviews).toHaveBeenCalledTimes(1);
      expect(repo.listReviews).toHaveBeenCalledWith({
        status: 'approved',
        pagination: { page: 2, limit: 50 },
      });
      expect(result).toMatchObject({
        data: [sampleReview],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });
  });
});
