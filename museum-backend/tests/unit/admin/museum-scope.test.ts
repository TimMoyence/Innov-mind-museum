import { ModerateReviewUseCase } from '@modules/review/useCase/moderation/moderateReview.useCase';
import { UpdateTicketStatusUseCase } from '@modules/support/useCase/ticket-admin/updateTicketStatus.useCase';
import { InMemorySupportRepository } from 'tests/helpers/support/inMemorySupportRepository';

import { makeReviewDTO } from '../../helpers/review/review.fixtures';

import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn(), logActorAction: jest.fn() },
  AUDIT_ADMIN_TICKET_UPDATED: 'ADMIN_TICKET_UPDATED',
  AUDIT_ADMIN_REVIEW_MODERATED: 'ADMIN_REVIEW_MODERATED',
}));

const audit = { log: jest.fn(), logActorAction: jest.fn() };

const reviewRepository = (museumId: number | null) => {
  const review = makeReviewDTO({ museumId });
  return {
    getReviewById: jest.fn().mockResolvedValue(review),
    moderateReview: jest.fn().mockResolvedValue({ ...review, status: 'approved' }),
  } as unknown as jest.Mocked<IReviewRepository>;
};

const supportRepository = (museumId: number | null) => {
  const repo = new InMemorySupportRepository();
  repo.seed({ id: 't-1', userId: 10, subject: 'Help', description: 'Need help', museumId });
  return repo;
};

const SCOPES: [string, number | null | undefined, number | null, 'allowed' | 'hidden'][] = [
  ['no scope sees a ticket of any museum', undefined, 5, 'allowed'],
  ['a null scope sees a ticket of any museum', null, 5, 'allowed'],
  ['a scope sees its own museum', 5, 5, 'allowed'],
  ['a scope does not see another museum', 5, 6, 'hidden'],
  ['a scope does not see an item without museum', 5, null, 'hidden'],
];

describe('PERIMETRE · an admin scoped to a museum acts only on that museum', () => {
  it.each(SCOPES)(
    'PERIMETRE · ticket update: %s',
    async (_case, scopeMuseumId, museumId, expected) => {
      const repo = supportRepository(museumId);
      const attempt = new UpdateTicketStatusUseCase(repo).execute({
        ticketId: 't-1',
        status: 'resolved',
        actorId: 1,
        scopeMuseumId,
      });

      if (expected === 'allowed') {
        await expect(attempt).resolves.toMatchObject({ status: 'resolved' });
      } else {
        await expect(attempt).rejects.toMatchObject({
          statusCode: 404,
          message: 'Ticket not found',
        });
        expect((await repo.getTicketById('t-1'))?.status).toBe('open');
      }
    },
  );

  it.each(SCOPES)(
    'PERIMETRE · review moderation: %s',
    async (_case, scopeMuseumId, museumId, expected) => {
      const repo = reviewRepository(museumId);
      const attempt = new ModerateReviewUseCase(repo, { audit }).execute({
        reviewId: 'review-001',
        status: 'approved',
        actorId: 1,
        scopeMuseumId,
      });

      if (expected === 'allowed') {
        await expect(attempt).resolves.toMatchObject({ status: 'approved' });
        expect(repo.moderateReview).toHaveBeenCalledTimes(1);
      } else {
        await expect(attempt).rejects.toMatchObject({
          statusCode: 404,
          message: 'Review not found',
        });
        expect(repo.moderateReview).not.toHaveBeenCalled();
      }
    },
  );
});
