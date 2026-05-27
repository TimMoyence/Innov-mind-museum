import { badRequest, unauthorized } from '@shared/errors/app.error';

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
  /**
   * NPS attribution (C2 / R1-R4 / Q1). UUID of the chat session the review was
   * authored from. The use-case resolves the session via the session-lookup
   * port and derives `museum_id` from `session.museumId` (may be NULL). An
   * absent / foreign / not-owned session persists BOTH `museum_id = NULL` AND
   * `session_id = NULL` silently (no 400, no FK violation, no existence leak,
   * no cross-user link). The `session_id` link is kept only when the lookup
   * succeeds. The author's own tenant claim is NEVER read.
   */
  sessionId?: string | null;
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
  constructor(
    private readonly repository: IReviewRepository,
    private readonly sessionLookup: IReviewSessionLookup,
  ) {}

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

    // NPS attribution (C2 / R1-R4 / Q1). Derive museum scope from the VISITED
    // session, never from the noter's tenant claim. Absent / foreign /
    // not-owned session → museumId NULL (silent, no 400, no existence leak).
    //
    // The sessionId link is persisted ONLY when the lookup succeeds (session
    // exists AND is owned by the noter). Persisting the raw client sessionId
    // unconditionally would (a) trip the reviews.session_id → chat_sessions FK
    // with a non-existent UUID (500 instead of the silent 201), and (b) link a
    // review to another user's session (cross-user privacy leak) while the
    // 201/500 split would become an existence oracle, defeating the
    // IReviewSessionLookup no-existence-leak guarantee. Keep museumId and
    // sessionId coherent: both NULL when the lookup misses.
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
