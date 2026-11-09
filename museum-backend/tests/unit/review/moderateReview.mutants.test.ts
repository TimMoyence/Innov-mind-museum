import { logger } from '@shared/logger/logger';
import { ModerateReviewUseCase } from '@modules/review/useCase/moderation/moderateReview.useCase';

import type {
  ReviewAuthorLookup,
  ReviewAuthorSnapshot,
} from '@modules/review/useCase/moderation/moderateReview.useCase';
import type { ReviewModerationNotifier } from '@modules/review/domain/ports/review-moderation-notifier.port';
import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type { ReviewDTO } from '@modules/review/domain/review/review.types';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockedLogger = logger as jest.Mocked<typeof logger>;

const fakeReview: ReviewDTO = {
  id: '00000000-0000-0000-0000-000000000001',
  userId: 1,
  userName: 'Test User',
  rating: 5,
  comment: 'Great museum assistant app!',
  status: 'pending',
  museumId: null,
  createdAt: '2026-03-26T12:00:00.000Z',
};

const makeRepo = (
  overrides: Partial<jest.Mocked<IReviewRepository>> = {},
): jest.Mocked<IReviewRepository> =>
  ({
    createReview: jest.fn().mockResolvedValue(fakeReview),
    listReviews: jest
      .fn()
      .mockResolvedValue({ data: [fakeReview], total: 1, page: 1, limit: 20, totalPages: 1 }),
    getReviewById: jest.fn().mockResolvedValue(fakeReview),
    moderateReview: jest.fn().mockResolvedValue({ ...fakeReview, status: 'approved' }),
    getAverageRating: jest.fn().mockResolvedValue({ average: 4.5, count: 10 }),
    listForUser: jest.fn().mockResolvedValue([fakeReview]),
    findByMuseum: jest
      .fn()
      .mockResolvedValue({ data: [fakeReview], total: 1, page: 1, limit: 20, totalPages: 1 }),
    aggregateNps: jest
      .fn()
      .mockResolvedValue({ nps: 0, promoters: 0, passives: 0, detractors: 0, count: 0 }),
    ...overrides,
  }) as jest.Mocked<IReviewRepository>;

const makeAudit = (): { log: jest.Mock; logActorAction: jest.Mock } => ({
  log: jest.fn(),
  logActorAction: jest.fn(),
});

const flushPromises = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

const baseAuthor: ReviewAuthorSnapshot = {
  id: 1,
  email: 'author@example.com',
  firstname: 'Alice',
  notifyOnReviewModeration: true,
};

describe('ModerateReviewUseCase — mutation kills', () => {
  beforeEach(() => {
    mockedLogger.warn.mockClear();
    mockedLogger.info.mockClear();
    mockedLogger.error.mockClear();
  });

  it('rejects invalid status with the EXACT comma-separated allowed list (kills L69 StringLiteral)', async () => {
    const repo = makeRepo();
    const audit = makeAudit();
    const uc = new ModerateReviewUseCase(repo, audit);

    await expect(
      uc.execute({ reviewId: fakeReview.id, status: 'bogus', actorId: 7 }),
    ).rejects.toThrow('status must be one of: approved, rejected');
  });

  it('skips notification scheduling when notifier is set but authorLookup is MISSING (kills L107 LogicalOperator || → &&)', async () => {
    const repo = makeRepo();
    const audit = makeAudit();
    const notify = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
    const notifier: ReviewModerationNotifier = { notify };
    const uc = new ModerateReviewUseCase(repo, { audit, notifier });

    await uc.execute({ reviewId: fakeReview.id, status: 'approved', actorId: 42 });
    await flushPromises();

    expect(notify).not.toHaveBeenCalled();
    const failureLogs = mockedLogger.warn.mock.calls.filter(
      ([event]) => event === 'fire_and_forget_failed',
    );
    expect(failureLogs).toHaveLength(0);
  });

  it('skips notification scheduling when authorLookup is set but notifier is MISSING (kills L107 LogicalOperator || → &&)', async () => {
    const repo = makeRepo();
    const audit = makeAudit();
    const lookup = jest.fn<Promise<ReviewAuthorSnapshot | null>, [number]>();
    const uc = new ModerateReviewUseCase(repo, { audit, authorLookup: lookup });

    await uc.execute({ reviewId: fakeReview.id, status: 'approved', actorId: 42 });
    await flushPromises();

    expect(lookup).not.toHaveBeenCalled();
    const failureLogs = mockedLogger.warn.mock.calls.filter(
      ([event]) => event === 'fire_and_forget_failed',
    );
    expect(failureLogs).toHaveLength(0);
  });

  it('skips notification scheduling when BOTH notifier and authorLookup are MISSING (kills L107 ConditionalExpression → false)', async () => {
    const repo = makeRepo();
    const audit = makeAudit();
    const uc = new ModerateReviewUseCase(repo, { audit });

    const result = await uc.execute({
      reviewId: fakeReview.id,
      status: 'approved',
      actorId: 42,
    });
    await flushPromises();

    expect(result.status).toBe('approved');
    const failureLogs = mockedLogger.warn.mock.calls.filter(
      ([event]) => event === 'fire_and_forget_failed',
    );
    expect(failureLogs).toHaveLength(0);
  });

  it('notifies the author for status=approved (kills L109 ConditionalExpression → true)', async () => {
    const repo = makeRepo();
    const audit = makeAudit();
    const notify = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
    const notifier: ReviewModerationNotifier = { notify };
    const lookup: ReviewAuthorLookup = jest
      .fn<Promise<ReviewAuthorSnapshot | null>, [number]>()
      .mockResolvedValue(baseAuthor);
    const uc = new ModerateReviewUseCase(repo, { audit, notifier, authorLookup: lookup });

    await uc.execute({ reviewId: fakeReview.id, status: 'approved', actorId: 42 });
    await flushPromises();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({
      recipientEmail: 'author@example.com',
      recipientName: 'Alice',
      reviewId: fakeReview.id,
      rating: 5,
      comment: 'Great museum assistant app!',
      afterStatus: 'approved',
      locale: 'fr',
    });
  });

  it('notifies the author for status=rejected (kills L109:61 StringLiteral "rejected" → "")', async () => {
    const repo = makeRepo({
      moderateReview: jest.fn().mockResolvedValue({ ...fakeReview, status: 'rejected' }),
    });
    const audit = makeAudit();
    const notify = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
    const notifier: ReviewModerationNotifier = { notify };
    const lookup: ReviewAuthorLookup = jest
      .fn<Promise<ReviewAuthorSnapshot | null>, [number]>()
      .mockResolvedValue(baseAuthor);
    const uc = new ModerateReviewUseCase(repo, { audit, notifier, authorLookup: lookup });

    await uc.execute({ reviewId: fakeReview.id, status: 'rejected', actorId: 42 });
    await flushPromises();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({
      recipientEmail: 'author@example.com',
      recipientName: 'Alice',
      reviewId: fakeReview.id,
      rating: 5,
      comment: 'Great museum assistant app!',
      afterStatus: 'rejected',
      locale: 'fr',
    });
  });

  it('logs an EXACT warn event with full metadata when authorLookup returns null (kills L117, L118, L119)', async () => {
    const repo = makeRepo();
    const audit = makeAudit();
    const notify = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
    const notifier: ReviewModerationNotifier = { notify };
    const lookup: ReviewAuthorLookup = jest
      .fn<Promise<ReviewAuthorSnapshot | null>, [number]>()
      .mockResolvedValue(null);
    const uc = new ModerateReviewUseCase(repo, { audit, notifier, authorLookup: lookup });

    await uc.execute({ reviewId: fakeReview.id, status: 'approved', actorId: 42 });
    await flushPromises();

    expect(notify).not.toHaveBeenCalled();

    const skipLogs = mockedLogger.warn.mock.calls.filter(
      ([event]) => event === 'review_moderation_notify_skipped',
    );
    expect(skipLogs).toHaveLength(1);
    expect(skipLogs[0][0]).toBe('review_moderation_notify_skipped');
    expect(skipLogs[0][1]).toEqual({
      reason: 'author_not_found',
      reviewId: fakeReview.id,
    });

    const failureLogs = mockedLogger.warn.mock.calls.filter(
      ([event]) => event === 'fire_and_forget_failed',
    );
    expect(failureLogs).toHaveLength(0);
  });

  it('returns cleanly (no crash) when authorLookup returns null — guards `author.notifyOnReviewModeration` access (kills L117 ConditionalExpression → false)', async () => {
    const repo = makeRepo();
    const audit = makeAudit();
    const notify = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
    const notifier: ReviewModerationNotifier = { notify };
    const lookup: ReviewAuthorLookup = jest
      .fn<Promise<ReviewAuthorSnapshot | null>, [number]>()
      .mockResolvedValue(null);
    const uc = new ModerateReviewUseCase(repo, { audit, notifier, authorLookup: lookup });

    const result = await uc.execute({
      reviewId: fakeReview.id,
      status: 'approved',
      actorId: 42,
    });
    await flushPromises();

    expect(result.status).toBe('approved');
    expect(audit.logActorAction).toHaveBeenCalledTimes(1);
    const failureLogs = mockedLogger.warn.mock.calls.filter(
      ([event]) => event === 'fire_and_forget_failed',
    );
    expect(failureLogs).toHaveLength(0);
  });
});
