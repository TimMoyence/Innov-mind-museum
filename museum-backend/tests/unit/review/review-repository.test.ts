import type { Repository, UpdateResult } from 'typeorm';

import { Review } from '@modules/review/domain/review/review.entity';

import { ReviewRepositoryPg } from '@modules/review/adapters/secondary/pg/review.repository.pg';
import { makeReview } from 'tests/helpers/review/review.fixtures';
import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';
import { makeMockTypeOrmRepo, makeMockDataSource } from 'tests/helpers/shared/mock-deps';

function buildMocks() {
  const qb = makeMockQb();
  const { repo } = makeMockTypeOrmRepo<Review>({ qb });
  const dataSource = makeMockDataSource(repo);
  return { repo, qb, dataSource };
}

describe('ReviewRepositoryPg', () => {
  let sut: ReviewRepositoryPg;
  let repo: jest.Mocked<Repository<Review>>;
  let qb: ReturnType<typeof makeMockQb>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = buildMocks();
    repo = mocks.repo;
    qb = mocks.qb;
    sut = new ReviewRepositoryPg(mocks.dataSource);
  });

  // ─── createReview ───
  describe('createReview', () => {
    it('creates and saves a review, returns DTO', async () => {
      const entity = makeReview();
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      const result = await sut.createReview({
        userId: 1,
        userName: 'Test User',
        rating: 4,
        comment: 'Great app!',
      });

      expect(repo.create).toHaveBeenCalledWith({
        userId: 1,
        userName: 'Test User',
        rating: 4,
        comment: 'Great app!',
        // Wave B C7 — repo always normalises museumId to null when caller omits.
        museumId: null,
      });
      expect(result).toEqual({
        id: 'review-001',
        userId: 1,
        userName: 'Test User',
        rating: 4,
        comment: 'Great app!',
        status: 'pending',
        // Wave B C7 — DTO surfaces tenant scope (null = unscoped public review).
        museumId: null,
        createdAt: '2025-06-01T00:00:00.000Z',
      });
    });
  });

  // ─── listReviews ───
  describe('listReviews', () => {
    it('returns paginated reviews without status filter', async () => {
      const reviews = [makeReview({ id: 'r1' }), makeReview({ id: 'r2' })];
      qb.getCount.mockResolvedValue(2);
      qb.getMany.mockResolvedValue(reviews);

      const result = await sut.listReviews({
        pagination: { page: 1, limit: 10 },
      });

      expect(qb.where).not.toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith('r.createdAt', 'DESC');
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('applies status filter', async () => {
      qb.getCount.mockResolvedValue(0);
      qb.getMany.mockResolvedValue([]);

      await sut.listReviews({
        status: 'approved',
        pagination: { page: 1, limit: 5 },
      });

      // Wave B C7 — listReviews now accumulates predicates via andWhere
      // uniformly (first-call andWhere behaves as where in TypeORM 0.3.x).
      expect(qb.andWhere).toHaveBeenCalledWith('r.status = :status', { status: 'approved' });
    });

    it('computes correct offset for page 2', async () => {
      qb.getCount.mockResolvedValue(15);
      qb.getMany.mockResolvedValue([]);

      const result = await sut.listReviews({
        pagination: { page: 2, limit: 10 },
      });

      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(result.totalPages).toBe(2);
    });
  });

  // ─── getReviewById ───
  describe('getReviewById', () => {
    it('returns review DTO when found', async () => {
      const entity = makeReview();
      repo.findOne.mockResolvedValue(entity);

      const result = await sut.getReviewById('review-001');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'review-001' } });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'review-001',
          rating: 4,
        }),
      );
    });

    it('returns null when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await sut.getReviewById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── moderateReview ───
  describe('moderateReview', () => {
    it('updates status and returns review DTO', async () => {
      const entity = makeReview({ status: 'approved' });
      repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      repo.findOne.mockResolvedValue(entity);

      const result = await sut.moderateReview({
        reviewId: 'review-001',
        status: 'approved',
      });

      expect(repo.update).toHaveBeenCalledWith('review-001', { status: 'approved' });
      expect(result).toBeDefined();
      expect(result?.status).toBe('approved');
    });

    it('re-fetches by id with strict { where: { id } } shape after update', async () => {
      // Kills L84:44 + L84:53 ObjectLiteral survivors — empty-object mutants
      // would otherwise survive because the existing happy-path test only
      // asserts `result?.status`, never the findOne argument shape.
      const entity = makeReview({ id: 'review-xyz', status: 'rejected' });
      repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      repo.findOne.mockResolvedValue(entity);

      await sut.moderateReview({
        reviewId: 'review-xyz',
        status: 'rejected',
      });

      expect(repo.findOne).toHaveBeenCalledTimes(1);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'review-xyz' } });
      // Belt-and-suspenders: the call argument is exactly the nested object,
      // not the empty `{}` produced by the ObjectLiteral mutator.
      const callArg = repo.findOne.mock.calls[0][0] as { where: { id: string } };
      expect(callArg).toEqual({ where: { id: 'review-xyz' } });
      expect(callArg.where).toEqual({ id: 'review-xyz' });
      expect(Object.keys(callArg)).toEqual(['where']);
      expect(Object.keys(callArg.where)).toEqual(['id']);
    });

    it('returns null when review not found (affected=0)', async () => {
      repo.update.mockResolvedValue({ affected: 0 } as UpdateResult);

      const result = await sut.moderateReview({
        reviewId: 'nonexistent',
        status: 'rejected',
      });

      expect(result).toBeNull();
    });

    it('returns null when affected is undefined', async () => {
      repo.update.mockResolvedValue({
        affected: undefined,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);

      const result = await sut.moderateReview({
        reviewId: 'x',
        status: 'approved',
      });

      expect(result).toBeNull();
    });
  });

  // ─── getAverageRating ───
  describe('getAverageRating', () => {
    it('returns average and count from approved reviews', async () => {
      qb.getRawOne.mockResolvedValue({ average: '4.5', count: '10' });

      const result = await sut.getAverageRating();

      // Kills L100:27 StringLiteral survivor — alias passed to createQueryBuilder
      // must be exactly 'review' (not "") so the SQL refs (`review.rating`,
      // `review.id`, `review.status`) resolve to a real FROM-clause alias.
      expect(repo.createQueryBuilder).toHaveBeenCalledWith('review');
      expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(qb.select).toHaveBeenCalledWith('COALESCE(AVG(review.rating), 0)', 'average');
      expect(qb.addSelect).toHaveBeenCalledWith('COUNT(review.id)', 'count');
      expect(qb.where).toHaveBeenCalledWith('review.status = :status', { status: 'approved' });
      expect(result).toEqual({ average: 4.5, count: 10 });
    });

    it('returns zeros when no reviews exist', async () => {
      qb.getRawOne.mockResolvedValue(null);

      const result = await sut.getAverageRating();

      expect(result).toEqual({ average: 0, count: 0 });
    });

    it('handles string "0" results', async () => {
      qb.getRawOne.mockResolvedValue({ average: '0', count: '0' });

      const result = await sut.getAverageRating();

      expect(result).toEqual({ average: 0, count: 0 });
    });
  });
});
