import { badRequest, notFound } from '@shared/errors/app.error';

import type { IReviewRepository } from '../domain/review.repository.interface';
import type { ReviewDTO, ReviewStatus } from '../domain/review.types';

/** Input for the moderate-review use case. */
interface ModerateReviewUseCaseInput {
  reviewId: string;
  status: string;
}

const MODERATION_STATUSES: ReviewStatus[] = ['approved', 'rejected'];

/** Validates the new status and delegates the moderation to the repository. */
export class ModerateReviewUseCase {
  constructor(private readonly repository: IReviewRepository) {}

  /** Validates the status enum and updates the review. */
  async execute(input: ModerateReviewUseCaseInput): Promise<ReviewDTO> {
    if (!MODERATION_STATUSES.includes(input.status as ReviewStatus)) {
      throw badRequest(`status must be one of: ${MODERATION_STATUSES.join(', ')}`);
    }

    const updated = await this.repository.moderateReview({
      reviewId: input.reviewId,
      status: input.status as ReviewStatus,
    });

    if (!updated) {
      throw notFound('Review not found');
    }

    return updated;
  }
}
