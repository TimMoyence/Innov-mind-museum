/**
 * Mutation-coverage tests for CreateReviewUseCase.
 *
 * Targets 5 Stryker survivors in `src/modules/review/useCase/public/createReview.useCase.ts`:
 *  - L47 MethodExpression `input.comment.trim()` → `input.comment`
 *  - L48 EqualityOperator `comment.length < 10` → `<= 10`
 *  - L48 ConditionalExpression `comment.length > 2000` → `false`
 *  - L48 EqualityOperator `comment.length > 2000` → `>= 2000`
 *  - L52 MethodExpression `buildReviewDisplayName(input.user).slice(0, 128)` → `buildReviewDisplayName(input.user)`
 *
 * Strategy: full-payload `toHaveBeenCalledWith`, exact boundary lengths, and
 * a 130-char display name to lock truncation at 128.
 */

import { CreateReviewUseCase } from '@modules/review/useCase/public/createReview.useCase';

import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type { ReviewDTO } from '@modules/review/domain/review/review.types';

const persistedReview: ReviewDTO = {
  id: '00000000-0000-0000-0000-000000000001',
  userId: 1,
  userName: 'Ada L.',
  rating: 5,
  comment: 'Great museum assistant app!',
  status: 'pending',
  museumId: null,
  createdAt: '2026-03-26T12:00:00.000Z',
};

function makeRepo(): jest.Mocked<IReviewRepository> {
  return {
    createReview: jest.fn().mockResolvedValue(persistedReview),
    listReviews: jest
      .fn()
      .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    getReviewById: jest.fn().mockResolvedValue(null),
    moderateReview: jest.fn().mockResolvedValue(null),
    getAverageRating: jest.fn().mockResolvedValue({ average: 0, count: 0 }),
    listForUser: jest.fn().mockResolvedValue([]),
    findByMuseum: jest
      .fn()
      .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    aggregateNps: jest
      .fn()
      .mockResolvedValue({ nps: 0, promoters: 0, passives: 0, detractors: 0, count: 0 }),
  };
}

describe('CreateReviewUseCase — mutation coverage', () => {
  describe('comment trimming (L47 MethodExpression)', () => {
    it('trims surrounding whitespace before persisting and length validation', async () => {
      const repo = makeRepo();
      const uc = new CreateReviewUseCase(repo);

      await uc.execute({
        user: { id: 1, firstname: 'Ada', lastname: 'Lovelace' },
        rating: 5,
        comment: '   A valid comment.   ',
      });

      // If trim() were dropped, the call would receive the padded string.
      expect(repo.createReview).toHaveBeenCalledTimes(1);
      expect(repo.createReview).toHaveBeenCalledWith({
        userId: 1,
        userName: 'Ada L.',
        rating: 5,
        comment: 'A valid comment.',
      });
    });

    it('rejects whitespace-padded short comment whose trimmed length is < 10', async () => {
      // "  hi  " has length 6 trimmed; without trim() it would be 6 too but the
      // pure-whitespace fast-path `!comment` would not fire.  This test specifically
      // catches the trim() removal mutant because the padded version has length 16
      // and would slip past the length check if trim() were absent.
      const repo = makeRepo();
      const uc = new CreateReviewUseCase(repo);

      const padded = '   short!!   '; // raw length 13, trimmed length 8
      await expect(
        uc.execute({
          user: { id: 1, firstname: 'Ada', lastname: 'Lovelace' },
          rating: 5,
          comment: padded,
        }),
      ).rejects.toThrow('comment must be between 10 and 2000 characters');

      expect(repo.createReview).not.toHaveBeenCalled();
    });
  });

  describe('comment length lower bound (L48 EqualityOperator `< 10`)', () => {
    it('accepts a comment of exactly 10 characters (boundary)', async () => {
      const repo = makeRepo();
      const uc = new CreateReviewUseCase(repo);
      const tenChars = 'abcdefghij'; // length === 10

      await uc.execute({
        user: { id: 1, firstname: 'Ada', lastname: 'Lovelace' },
        rating: 4,
        comment: tenChars,
      });

      expect(repo.createReview).toHaveBeenCalledWith({
        userId: 1,
        userName: 'Ada L.',
        rating: 4,
        comment: tenChars,
      });
    });

    it('rejects a comment of exactly 9 characters', async () => {
      const repo = makeRepo();
      const uc = new CreateReviewUseCase(repo);
      await expect(
        uc.execute({
          user: { id: 1, firstname: 'Ada', lastname: 'Lovelace' },
          rating: 4,
          comment: 'abcdefghi',
        }),
      ).rejects.toThrow('comment must be between 10 and 2000 characters');
      expect(repo.createReview).not.toHaveBeenCalled();
    });
  });

  describe('comment length upper bound (L48 ConditionalExpression / EqualityOperator `> 2000`)', () => {
    it('accepts a comment of exactly 2000 characters (boundary)', async () => {
      const repo = makeRepo();
      const uc = new CreateReviewUseCase(repo);
      const twoThousand = 'x'.repeat(2000);

      await uc.execute({
        user: { id: 1, firstname: 'Ada', lastname: 'Lovelace' },
        rating: 3,
        comment: twoThousand,
      });

      expect(repo.createReview).toHaveBeenCalledTimes(1);
      expect(repo.createReview).toHaveBeenCalledWith({
        userId: 1,
        userName: 'Ada L.',
        rating: 3,
        comment: twoThousand,
      });
    });

    it('rejects a comment of exactly 2001 characters', async () => {
      const repo = makeRepo();
      const uc = new CreateReviewUseCase(repo);
      await expect(
        uc.execute({
          user: { id: 1, firstname: 'Ada', lastname: 'Lovelace' },
          rating: 3,
          comment: 'x'.repeat(2001),
        }),
      ).rejects.toThrow('comment must be between 10 and 2000 characters');
      expect(repo.createReview).not.toHaveBeenCalled();
    });
  });

  describe('display name truncation (L52 MethodExpression `.slice(0, 128)`)', () => {
    it('truncates a long derived display name to 128 characters before persisting', async () => {
      const repo = makeRepo();
      const uc = new CreateReviewUseCase(repo);

      // firstname (130 chars) + " " + last-initial "." = 133 chars → trimmed to 128.
      const longFirstname = 'A'.repeat(130);

      await uc.execute({
        user: { id: 42, firstname: longFirstname, lastname: 'Lovelace' },
        rating: 5,
        comment: 'A valid comment here.',
      });

      expect(repo.createReview).toHaveBeenCalledTimes(1);
      const callArg = repo.createReview.mock.calls[0]?.[0];
      expect(callArg).toBeDefined();
      expect(callArg?.userName.length).toBe(128);
      // First 128 chars of "AAAA…(130)… L." → "A" * 128.
      expect(callArg?.userName).toBe('A'.repeat(128));
    });

    it('leaves a short display name untouched', async () => {
      const repo = makeRepo();
      const uc = new CreateReviewUseCase(repo);

      await uc.execute({
        user: { id: 7, firstname: 'Ada', lastname: 'Lovelace' },
        rating: 5,
        comment: 'A valid comment here.',
      });

      expect(repo.createReview).toHaveBeenCalledWith({
        userId: 7,
        userName: 'Ada L.',
        rating: 5,
        comment: 'A valid comment here.',
      });
    });
  });
});
