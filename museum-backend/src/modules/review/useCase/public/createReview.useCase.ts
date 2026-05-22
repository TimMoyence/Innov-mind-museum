import { badRequest, unauthorized } from '@shared/errors/app.error';

import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type { CreateReviewInput, ReviewDTO } from '@modules/review/domain/review/review.types';

export interface ReviewAuthorProfile {
  id: number;
  firstname?: string | null;
  lastname?: string | null;
}

interface CreateReviewUseCaseInput {
  user: ReviewAuthorProfile;
  rating: number;
  comment: string;
  /**
   * B2B multi-tenant scope (Wave B C7 / R-C7c). Threaded from the route layer
   * via the authenticated user's `museumId` JWT claim. `null`/`undefined`
   * for public reviews not attached to a tenant museum (pre-B2B / catalog
   * reviews). Persisted as `museum_id` on the review row.
   */
  museumId?: number | null;
}

/**
 * Shape: "Firstname L." (first initial of last name), or just the firstname when absent.
 * Falls back to "Anonymous" if neither firstname nor lastname exists.
 */
export function buildReviewDisplayName(user: ReviewAuthorProfile): string {
  const firstname = user.firstname?.trim() ?? '';
  const lastname = user.lastname?.trim() ?? '';
  if (!firstname && !lastname) return 'Anonymous';
  if (firstname && lastname) return `${firstname} ${lastname.charAt(0)}.`;
  return firstname || `${lastname.charAt(0)}.`;
}

/** Creates a new review with status 'pending'. */
export class CreateReviewUseCase {
  constructor(private readonly repository: IReviewRepository) {}

  async execute(input: CreateReviewUseCaseInput): Promise<ReviewDTO> {
    if (!input.user.id) {
      throw unauthorized('User authentication required');
    }

    // Wave B C7 / R-C7b — NPS 0-10 range (was 1-5; back-compat: 1-5 still
    // valid since the new range is a strict superset).
    if (!Number.isInteger(input.rating) || input.rating < 0 || input.rating > 10) {
      throw badRequest('rating must be an integer between 0 and 10');
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
    // Only thread museumId when explicitly provided — keeps the persisted
    // shape byte-identical for unscoped/public reviews and preserves the
    // pre-existing call-site contracts of upstream tests.
    if (input.museumId !== undefined && input.museumId !== null) {
      createInput.museumId = input.museumId;
    }

    return await this.repository.createReview(createInput);
  }
}
