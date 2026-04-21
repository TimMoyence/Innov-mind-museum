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
  const makeAuditSpy = () => ({ log: jest.fn() });

  it('approves a review', async () => {
    const repo = makeFakeRepo();
    const audit = makeAuditSpy();
    const uc = new ModerateReviewUseCase(repo, audit);
    const result = await uc.execute({ reviewId: fakeReview.id, status: 'approved', actorId: 7 });
    expect(result.status).toBe('approved');
    expect(repo.moderateReview).toHaveBeenCalledWith({
      reviewId: fakeReview.id,
      status: 'approved',
    });
  });

  it('rejects invalid status', async () => {
    const repo = makeFakeRepo();
    const audit = makeAuditSpy();
    const uc = new ModerateReviewUseCase(repo, audit);
    await expect(
      uc.execute({ reviewId: fakeReview.id, status: 'invalid', actorId: 7 }),
    ).rejects.toThrow('status');
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('throws not found when review does not exist (pre-check)', async () => {
    const repo = makeFakeRepo();
    repo.getReviewById.mockResolvedValueOnce(null);
    const audit = makeAuditSpy();
    const uc = new ModerateReviewUseCase(repo, audit);
    await expect(
      uc.execute({ reviewId: 'missing-id', status: 'approved', actorId: 7 }),
    ).rejects.toThrow('not found');
    expect(repo.moderateReview).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('throws not found when update affects zero rows', async () => {
    const repo = makeFakeRepo();
    repo.moderateReview.mockResolvedValueOnce(null);
    const audit = makeAuditSpy();
    const uc = new ModerateReviewUseCase(repo, audit);
    await expect(
      uc.execute({ reviewId: fakeReview.id, status: 'approved', actorId: 7 }),
    ).rejects.toThrow('not found');
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('emits an ADMIN_REVIEW_MODERATED audit log with before/after state', async () => {
    const repo = makeFakeRepo();
    const audit = makeAuditSpy();
    const uc = new ModerateReviewUseCase(repo, audit);

    await uc.execute({
      reviewId: fakeReview.id,
      status: 'approved',
      actorId: 42,
      ip: '203.0.113.7',
      requestId: '11111111-2222-3333-4444-555555555555',
    });

    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith({
      action: 'ADMIN_REVIEW_MODERATED',
      actorType: 'user',
      actorId: 42,
      targetType: 'review',
      targetId: fakeReview.id,
      metadata: { beforeStatus: 'pending', afterStatus: 'approved' },
      ip: '203.0.113.7',
      requestId: '11111111-2222-3333-4444-555555555555',
    });
  });

  describe('review-moderation notification (H3)', () => {
    const flushPromises = async (): Promise<void> => {
      await new Promise((resolve) => setImmediate(resolve));
    };

    const baseAuthor = {
      id: 1,
      email: 'author@example.com',
      firstname: 'Alice',
      notifyOnReviewModeration: true,
    };

    it('notifies the author when they have opted-in (approved)', async () => {
      const repo = makeFakeRepo();
      const audit = makeAuditSpy();
      const notify = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
      const uc = new ModerateReviewUseCase(repo, {
        audit,
        notifier: { notify },
        authorLookup: async () => baseAuthor,
      });

      await uc.execute({ reviewId: fakeReview.id, status: 'approved', actorId: 42 });
      await flushPromises();

      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientEmail: 'author@example.com',
          recipientName: 'Alice',
          afterStatus: 'approved',
          reviewId: fakeReview.id,
        }),
      );
    });

    it('skips notification when author has NOT opted in', async () => {
      const repo = makeFakeRepo();
      const audit = makeAuditSpy();
      const notify = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
      const uc = new ModerateReviewUseCase(repo, {
        audit,
        notifier: { notify },
        authorLookup: async () => ({ ...baseAuthor, notifyOnReviewModeration: false }),
      });

      await uc.execute({ reviewId: fakeReview.id, status: 'approved', actorId: 42 });
      await flushPromises();

      expect(notify).not.toHaveBeenCalled();
    });

    it('skips notification when author lookup returns null', async () => {
      const repo = makeFakeRepo();
      const audit = makeAuditSpy();
      const notify = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
      const uc = new ModerateReviewUseCase(repo, {
        audit,
        notifier: { notify },
        authorLookup: async () => null,
      });

      await uc.execute({ reviewId: fakeReview.id, status: 'approved', actorId: 42 });
      await flushPromises();

      expect(notify).not.toHaveBeenCalled();
    });

    it('notification failure does NOT fail the moderation (fire-and-forget)', async () => {
      const repo = makeFakeRepo();
      const audit = makeAuditSpy();
      const notify = jest
        .fn<Promise<void>, [unknown]>()
        .mockRejectedValue(new Error('smtp timeout'));
      const uc = new ModerateReviewUseCase(repo, {
        audit,
        notifier: { notify },
        authorLookup: async () => baseAuthor,
      });

      const result = await uc.execute({
        reviewId: fakeReview.id,
        status: 'approved',
        actorId: 42,
      });
      await flushPromises();

      expect(result.status).toBe('approved');
      expect(audit.log).toHaveBeenCalledTimes(1);
    });

    it('does not notify when the update resolves to a non-terminal status', async () => {
      const repo = makeFakeRepo();
      repo.moderateReview.mockResolvedValueOnce({ ...fakeReview, status: 'pending' });
      const audit = makeAuditSpy();
      const notify = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
      const uc = new ModerateReviewUseCase(repo, {
        audit,
        notifier: { notify },
        authorLookup: async () => baseAuthor,
      });

      await uc.execute({ reviewId: fakeReview.id, status: 'approved', actorId: 42 });
      await flushPromises();

      expect(notify).not.toHaveBeenCalled();
    });
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
