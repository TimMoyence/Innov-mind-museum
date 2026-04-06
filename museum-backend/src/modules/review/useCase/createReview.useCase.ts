import { badRequest } from '@shared/errors/app.error';

import type { IReviewRepository } from '../domain/review.repository.interface';
import type { CreateReviewInput, ReviewDTO } from '../domain/review.types';

/** Input for the create-review use case. */
interface CreateReviewUseCaseInput {
  userId: number;
  userName: string;
  rating: number;
  comment: string;
}

/** Validates inputs and creates a new review with status 'pending'. */
export class CreateReviewUseCase {
  constructor(private readonly repository: IReviewRepository) {}

  /** Validates rating range and comment, then creates the review. */
  async execute(input: CreateReviewUseCaseInput): Promise<ReviewDTO> {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw badRequest('rating must be an integer between 1 and 5');
    }

    const userName = input.userName.trim();
    if (!userName || userName.length > 128) {
      throw badRequest('userName must be between 1 and 128 characters');
    }

    const comment = input.comment.trim();
    if (!comment || comment.length < 10 || comment.length > 2000) {
      throw badRequest('comment must be between 10 and 2000 characters');
    }

    const createInput: CreateReviewInput = {
      userId: input.userId,
      userName,
      rating: input.rating,
      comment,
    };

    return await this.repository.createReview(createInput);
  }
}
