import { SubmitB2bLeadUseCase } from '@modules/leads/useCase/submitB2bLead.useCase';
import { CreateReviewUseCase } from '@modules/review/useCase/public/createReview.useCase';

import { makeB2bLeadPayload } from '../../helpers/leads/b2bLead.fixtures';
import { makeStubLeadRepository } from '../../helpers/leads/stubLeadRepository';

import type { IReviewSessionLookup } from '@modules/review/domain/ports/review-session-lookup.port';
import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';

const EMOJI = '🏛';

describe('L3 · les cas d’usage comptent les longueurs comme la route', () => {
  describe('demande B2B', () => {
    const notify = jest.fn().mockResolvedValue(undefined);
    const useCase = () => new SubmitB2bLeadUseCase({ notify }, makeStubLeadRepository());

    beforeEach(() => {
      notify.mockClear();
    });

    it('nom 120 emoji, musée 200 emoji, message 5 000 emoji : la demande part', async () => {
      await useCase().execute(
        makeB2bLeadPayload({
          name: EMOJI.repeat(120),
          museum: EMOJI.repeat(200),
          message: EMOJI.repeat(5000),
        }),
      );

      expect(notify).toHaveBeenCalledTimes(1);
    });

    it('musée de 201 emoji : refusé, rien ne part', async () => {
      await expect(
        useCase().execute(makeB2bLeadPayload({ museum: EMOJI.repeat(201) })),
      ).rejects.toThrow('museum must be between 1 and 200 characters');
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('avis', () => {
    const createReview = jest.fn().mockResolvedValue({ id: 'review-1' });
    const repository = { createReview } as unknown as IReviewRepository;
    const lookup: IReviewSessionLookup = { findSessionMuseum: jest.fn().mockResolvedValue(null) };
    const user = { id: 1, firstname: 'Ada', lastname: 'Lovelace' };

    beforeEach(() => {
      createReview.mockClear();
    });

    it('un commentaire de 2 000 emoji est enregistré', async () => {
      await new CreateReviewUseCase(repository, lookup).execute({
        user,
        rating: 9,
        comment: EMOJI.repeat(2000),
      });

      expect(createReview).toHaveBeenCalledTimes(1);
    });

    it('un commentaire de 2 001 emoji est refusé', async () => {
      await expect(
        new CreateReviewUseCase(repository, lookup).execute({
          user,
          rating: 9,
          comment: EMOJI.repeat(2001),
        }),
      ).rejects.toThrow('comment must be between 10 and 2000 characters');
      expect(createReview).not.toHaveBeenCalled();
    });
  });
});
