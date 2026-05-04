import { badRequest, unauthorized } from '@shared/errors/app.error';

import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type { CreateReviewInput, ReviewDTO } from '@modules/review/domain/review/review.types';

/** Authenticated user profile used to derive the display name server-side. */
export interface ReviewAuthorProfile {
  id: number;
  firstname?: string | null;
  lastname?: string | null;
}

/** Input for the create-review use case. */
interface CreateReviewUseCaseInput {
  user: ReviewAuthorProfile;
  rating: number;
  comment: string;
}

/**
 * Derives a public display name from an authenticated user profile.
 * Shape: "Firstname L." (first initial of the last name), or just the firstname when absent.
 * Falls back to "Anonymous" if neither firstname nor lastname exists.
 */
export function buildReviewDisplayName(user: ReviewAuthorProfile): string {
  const firstname = user.firstname?.trim() ?? '';
  const lastname = user.lastname?.trim() ?? '';
  if (!firstname && !lastname) return 'Anonymous';
  if (firstname && lastname) return `${firstname} ${lastname.charAt(0)}.`;
  return firstname || `${lastname.charAt(0)}.`;
}

/** Validates inputs and creates a new review with status 'pending'. */
export class CreateReviewUseCase {
  constructor(private readonly repository: IReviewRepository) {}

  /** Validates rating range and comment, derives userName from user profile, then persists. */
  async execute(input: CreateReviewUseCaseInput): Promise<ReviewDTO> {
    if (!input.user.id) {
      throw unauthorized('User authentication required');
    }

    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw badRequest('rating must be an integer between 1 and 5');
    }

    const comment = input.comment.trim();
    if (!comment || comment.length < 10 || comment.length > 2000) {
      throw badRequest('comment must be between 10 and 2000 characters');
    }

    const derivedName = buildReviewDisplayName(input.user).slice(0, 128);

    const createInput: CreateReviewInput = {
      userId: input.user.id,
      userName: derivedName,
      rating: input.rating,
      comment,
    };

    return await this.repository.createReview(createInput);
  }
}
