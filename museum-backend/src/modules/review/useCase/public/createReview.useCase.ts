import { describeLimit, isWithinLimit, TEXT_LIMITS } from '@musaium/shared';

import { invalidInput, unauthorized } from '@shared/errors/app.error';

import type { IReviewSessionLookup } from '@modules/review/domain/ports/review-session-lookup.port';
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
  sessionId?: string | null;
}

export function buildReviewDisplayName(user: ReviewAuthorProfile): string {
  const firstname = user.firstname?.trim() ?? '';
  const lastname = user.lastname?.trim() ?? '';
  if (!firstname && !lastname) return 'Anonymous';
  if (firstname && lastname) return `${firstname} ${lastname.charAt(0)}.`;
  return firstname || `${lastname.charAt(0)}.`;
}

export class CreateReviewUseCase {
  constructor(
    private readonly repository: IReviewRepository,
    private readonly sessionLookup: IReviewSessionLookup,
  ) {}

  async execute(input: CreateReviewUseCaseInput): Promise<ReviewDTO> {
    if (!input.user.id) {
      throw unauthorized('User authentication required');
    }

    if (!Number.isInteger(input.rating) || input.rating < 0 || input.rating > 10) {
      throw invalidInput('rating must be an integer between 0 and 10');
    }

    const comment = input.comment.trim();
    if (!isWithinLimit(comment, TEXT_LIMITS.reviewComment)) {
      throw invalidInput(describeLimit('comment', TEXT_LIMITS.reviewComment));
    }

    const derivedName = buildReviewDisplayName(input.user).slice(0, 128);

    let museumId: number | null = null;
    let resolvedSessionId: string | null = null;
    if (input.sessionId) {
      const session = await this.sessionLookup.findSessionMuseum(input.sessionId, input.user.id);
      if (session) {
        museumId = session.museumId;
        resolvedSessionId = input.sessionId;
      }
    }

    const createInput: CreateReviewInput = {
      userId: input.user.id,
      userName: derivedName,
      rating: input.rating,
      comment,
      museumId,
      sessionId: resolvedSessionId,
    };

    return await this.repository.createReview(createInput);
  }
}
