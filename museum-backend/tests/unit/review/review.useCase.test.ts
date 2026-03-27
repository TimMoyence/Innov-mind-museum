import { CreateReviewUseCase } from '@modules/review/useCase/createReview.useCase';
import { ListApprovedReviewsUseCase } from '@modules/review/useCase/listApprovedReviews.useCase';
import { ListAllReviewsUseCase } from '@modules/review/useCase/listAllReviews.useCase';
import { ModerateReviewUseCase } from '@modules/review/useCase/moderateReview.useCase';
import { GetReviewStatsUseCase } from '@modules/review/useCase/getReviewStats.useCase';
import type { IReviewRepository } from '@modules/review/domain/review.repository.interface';
import type { ReviewDTO } from '@modules/review/domain/review.types';

const fakeReview: ReviewDTO = {
  id: '00000000-0000-0000-0000-000000000001',
  userId: 1,
  userName: 'Test User',
  rating: 5,
  comment: 'Great museum assistant app!',
  status: 'pending',
  createdAt: '2026-03-26T12:00:00.000Z',
};

function makeFakeRepo(): jest.Mocked<IReviewRepository> {
  return {
    createReview: jest.fn().mockResolvedValue(fakeReview),
    listReviews: jest
      .fn()
      .mockResolvedValue({ data: [fakeReview], total: 1, page: 1, limit: 20, totalPages: 1 }),
    getReviewById: jest.fn().mockResolvedValue(fakeReview),
    moderateReview: jest.fn().mockResolvedValue({ ...fakeReview, status: 'approved' }),
    getAverageRating: jest.fn().mockResolvedValue({ average: 4.5, count: 10 }),
  };
}

// ─── CreateReviewUseCase ────────────────────────────────────────────

describe('CreateReviewUseCase', () => {
  it('creates a review with valid input', async () => {
    const repo = makeFakeRepo();
    const uc = new CreateReviewUseCase(repo);
    const result = await uc.execute({
      userId: 1,
      userName: 'Test User',
      rating: 5,
      comment: 'Great museum assistant app!',
    });
    expect(result.id).toBe(fakeReview.id);
    expect(repo.createReview).toHaveBeenCalledTimes(1);
  });

  it('rejects rating < 1', async () => {
    const repo = makeFakeRepo();
    const uc = new CreateReviewUseCase(repo);
    await expect(
      uc.execute({ userId: 1, userName: 'Test', rating: 0, comment: 'A valid comment here.' }),
    ).rejects.toThrow('rating');
  });

  it('rejects rating > 5', async () => {
    const repo = makeFakeRepo();
    const uc = new CreateReviewUseCase(repo);
    await expect(
      uc.execute({ userId: 1, userName: 'Test', rating: 6, comment: 'A valid comment here.' }),
    ).rejects.toThrow('rating');
  });

  it('rejects comment shorter than 10 chars', async () => {
    const repo = makeFakeRepo();
    const uc = new CreateReviewUseCase(repo);
    await expect(
      uc.execute({ userId: 1, userName: 'Test', rating: 4, comment: 'Short' }),
    ).rejects.toThrow('comment');
  });

  it('rejects empty userName', async () => {
    const repo = makeFakeRepo();
    const uc = new CreateReviewUseCase(repo);
    await expect(
      uc.execute({ userId: 1, userName: '  ', rating: 4, comment: 'A valid comment here.' }),
    ).rejects.toThrow('userName');
  });
});

// ─── ListApprovedReviewsUseCase ─────────────────────────────────────

describe('ListApprovedReviewsUseCase', () => {
  it('returns paginated approved reviews', async () => {
    const repo = makeFakeRepo();
    const uc = new ListApprovedReviewsUseCase(repo);
    const result = await uc.execute({ page: 1, limit: 20 });
    expect(result.data).toHaveLength(1);
    expect(repo.listReviews).toHaveBeenCalledWith({
      status: 'approved',
      pagination: { page: 1, limit: 20 },
    });
  });

  it('rejects page < 1', async () => {
    const repo = makeFakeRepo();
    const uc = new ListApprovedReviewsUseCase(repo);
    await expect(uc.execute({ page: 0, limit: 20 })).rejects.toThrow('page');
  });

  it('rejects limit > 100', async () => {
    const repo = makeFakeRepo();
    const uc = new ListApprovedReviewsUseCase(repo);
    await expect(uc.execute({ page: 1, limit: 101 })).rejects.toThrow('limit');
  });
});

// ─── ListAllReviewsUseCase (admin) ──────────────────────────────────

describe('ListAllReviewsUseCase', () => {
  it('returns all reviews without status filter', async () => {
    const repo = makeFakeRepo();
    const uc = new ListAllReviewsUseCase(repo);
    const result = await uc.execute({ page: 1, limit: 20 });
    expect(result.data).toHaveLength(1);
    expect(repo.listReviews).toHaveBeenCalledWith({
      status: undefined,
      pagination: { page: 1, limit: 20 },
    });
  });

  it('filters by status when provided', async () => {
    const repo = makeFakeRepo();
    const uc = new ListAllReviewsUseCase(repo);
    await uc.execute({ page: 1, limit: 20, status: 'pending' });
    expect(repo.listReviews).toHaveBeenCalledWith({
      status: 'pending',
      pagination: { page: 1, limit: 20 },
    });
  });

  it('rejects invalid status filter', async () => {
    const repo = makeFakeRepo();
    const uc = new ListAllReviewsUseCase(repo);
    await expect(uc.execute({ page: 1, limit: 20, status: 'bogus' })).rejects.toThrow('status');
  });

  it('rejects page < 1', async () => {
    const repo = makeFakeRepo();
    const uc = new ListAllReviewsUseCase(repo);
    await expect(uc.execute({ page: 0, limit: 20 })).rejects.toThrow('page');
  });
});

// ─── ModerateReviewUseCase ──────────────────────────────────────────

describe('ModerateReviewUseCase', () => {
  it('approves a review', async () => {
    const repo = makeFakeRepo();
    const uc = new ModerateReviewUseCase(repo);
    const result = await uc.execute({ reviewId: fakeReview.id, status: 'approved' });
    expect(result.status).toBe('approved');
    expect(repo.moderateReview).toHaveBeenCalledWith({
      reviewId: fakeReview.id,
      status: 'approved',
    });
  });

  it('rejects invalid status', async () => {
    const repo = makeFakeRepo();
    const uc = new ModerateReviewUseCase(repo);
    await expect(uc.execute({ reviewId: fakeReview.id, status: 'invalid' })).rejects.toThrow(
      'status',
    );
  });

  it('throws not found for missing review', async () => {
    const repo = makeFakeRepo();
    repo.moderateReview.mockResolvedValue(null);
    const uc = new ModerateReviewUseCase(repo);
    await expect(uc.execute({ reviewId: 'missing-id', status: 'approved' })).rejects.toThrow(
      'not found',
    );
  });
});

// ─── GetReviewStatsUseCase ──────────────────────────────────────────

describe('GetReviewStatsUseCase', () => {
  it('returns average rating and count', async () => {
    const repo = makeFakeRepo();
    const uc = new GetReviewStatsUseCase(repo);
    const result = await uc.execute();
    expect(result.average).toBe(4.5);
    expect(result.count).toBe(10);
  });
});
