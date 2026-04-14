import type { DataSource, Repository, UpdateResult } from 'typeorm';

import { Review } from '@modules/review/domain/review.entity';

import { ReviewRepositoryPg } from '@modules/review/adapters/secondary/review.repository.pg';
import { makeReview } from 'tests/helpers/review/review.fixtures';
import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';

function buildMocks() {
  const qb = makeMockQb();

  const repo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
  } as unknown as jest.Mocked<Repository<Review>>;

  const dataSource = {
    getRepository: jest.fn().mockReturnValue(repo),
  } as unknown as DataSource;

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
      });
      expect(result).toEqual({
        id: 'review-001',
        userId: 1,
        userName: 'Test User',
        rating: 4,
        comment: 'Great app!',
        status: 'pending',
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

      expect(qb.where).toHaveBeenCalledWith('r.status = :status', { status: 'approved' });
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

    it('returns null when review not found (affected=0)', async () => {
      repo.update.mockResolvedValue({ affected: 0 } as UpdateResult);

      const result = await sut.moderateReview({
        reviewId: 'nonexistent',
        status: 'rejected',
      });

      expect(result).toBeNull();
    });

    it('returns null when affected is undefined', async () => {
      repo.update.mockResolvedValue({ affected: undefined } as unknown as UpdateResult);

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
