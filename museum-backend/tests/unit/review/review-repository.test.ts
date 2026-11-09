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
        museumId: null,
      });
      expect(result).toEqual({
        id: 'review-001',
        userId: 1,
        userName: 'Test User',
        rating: 4,
        comment: 'Great app!',
        status: 'pending',
        museumId: null,
        createdAt: '2025-06-01T00:00:00.000Z',
      });
    });
  });

  describe('listReviews', () => {
    it('returns paginated reviews without status filter', async () => {
      const reviews = [makeReview({ id: 'r1' }), makeReview({ id: 'r2' })];
      qb.getManyAndCount.mockResolvedValue([reviews, 2]);

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
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      await sut.listReviews({
        status: 'approved',
        pagination: { page: 1, limit: 5 },
      });

      expect(qb.andWhere).toHaveBeenCalledWith('r.status = :status', { status: 'approved' });
    });

    it('computes correct offset for page 2', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 15]);

      const result = await sut.listReviews({
        pagination: { page: 2, limit: 10 },
      });

      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(result.totalPages).toBe(2);
    });
  });

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
      const entity = makeReview({ id: 'review-xyz', status: 'rejected' });
      repo.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      repo.findOne.mockResolvedValue(entity);

      await sut.moderateReview({
        reviewId: 'review-xyz',
        status: 'rejected',
      });

      expect(repo.findOne).toHaveBeenCalledTimes(1);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'review-xyz' } });
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

  describe('aggregateNps', () => {
    const rawZero = { promoters: '0', passives: '0', detractors: '0', count: '0' };

    it('omits the museumId predicate when called with NO argument (global, incl. museum_id NULL)', async () => {
      qb.getRawOne.mockResolvedValue(rawZero);

      await sut.aggregateNps();

      const allWhereCalls = [...qb.where.mock.calls, ...qb.andWhere.mock.calls];
      const scopedByMuseum = allWhereCalls.some(
        (args) => typeof args[0] === 'string' && /museumId/i.test(args[0]),
      );
      expect(scopedByMuseum).toBe(false);
      const scopedByStatus = allWhereCalls.some(
        (args) =>
          typeof args[0] === 'string' &&
          /status/i.test(args[0]) &&
          args[1] !== undefined &&
          (args[1] as { status?: string }).status === 'approved',
      );
      expect(scopedByStatus).toBe(true);
    });

    it('omits the museumId predicate when called with explicit null (global)', async () => {
      qb.getRawOne.mockResolvedValue(rawZero);

      await sut.aggregateNps(null);

      const allWhereCalls = [...qb.where.mock.calls, ...qb.andWhere.mock.calls];
      const scopedByMuseum = allWhereCalls.some(
        (args) => typeof args[0] === 'string' && /museumId/i.test(args[0]),
      );
      expect(scopedByMuseum).toBe(false);
    });

    it('adds `r.museumId = :museumId` predicate when scoped to a museum (42)', async () => {
      qb.getRawOne.mockResolvedValue(rawZero);

      await sut.aggregateNps(42);

      const allWhereCalls = [...qb.where.mock.calls, ...qb.andWhere.mock.calls];
      const scopedByMuseum = allWhereCalls.some(
        (args) =>
          typeof args[0] === 'string' &&
          /r\.museumId = :museumId/.test(args[0]) &&
          args[1] !== undefined &&
          (args[1] as { museumId?: number }).museumId === 42,
      );
      expect(scopedByMuseum).toBe(true);
    });

    it('uses band FILTER clauses 9..10 (promoters) / 7..8 (passives) / 0..6 (detractors)', async () => {
      qb.getRawOne.mockResolvedValue(rawZero);

      await sut.aggregateNps(42);

      const selectFragments = [...qb.select.mock.calls, ...qb.addSelect.mock.calls]
        .map((args) => (typeof args[0] === 'string' ? args[0] : ''))
        .join(' | ');

      expect(selectFragments).toMatch(
        /rating\s*>=\s*9[\s\S]*rating\s*<=\s*10|rating BETWEEN 9 AND 10/i,
      );
      expect(selectFragments).toMatch(
        /rating\s*>=\s*7[\s\S]*rating\s*<=\s*8|rating BETWEEN 7 AND 8/i,
      );
      expect(selectFragments).toMatch(
        /rating\s*>=\s*0[\s\S]*rating\s*<=\s*6|rating BETWEEN 0 AND 6/i,
      );
    });

    it('returns neutral aggregate {nps:0, all buckets 0} when count = 0', async () => {
      qb.getRawOne.mockResolvedValue(rawZero);

      const result = await sut.aggregateNps();

      expect(result).toEqual({ nps: 0, promoters: 0, passives: 0, detractors: 0, count: 0 });
    });
  });

  describe('getAverageRating', () => {
    it('returns average and count from approved reviews', async () => {
      qb.getRawOne.mockResolvedValue({ average: '4.5', count: '10' });

      const result = await sut.getAverageRating();

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
