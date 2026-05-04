import type {
  ListAllReviewsInput,
  ListAllReviewsUseCase,
} from '@modules/review/useCase/admin/listAllReviews.useCase';
import type {
  ModerateReviewUseCase,
  ModerateReviewUseCaseInput,
} from '@modules/review/useCase/moderation/moderateReview.useCase';

/**
 * Admin-side facade over the review module.
 *
 * Primary adapter layer depends on this facade instead of on peer-module
 * use-cases directly. Keeps hexagonal boundary clean: admin/http sees only
 * admin/useCase; cross-module coupling lives in one place.
 */
export class AdminReviewFacade {
  constructor(
    private readonly listAll: ListAllReviewsUseCase,
    private readonly moderate: ModerateReviewUseCase,
  ) {}

  /** List reviews with optional status filter + pagination (admin view). */
  list(input: ListAllReviewsInput): ReturnType<ListAllReviewsUseCase['execute']> {
    return this.listAll.execute(input);
  }

  /** Moderate a single review (approve / reject) with audit trail. */
  moderateReview(input: ModerateReviewUseCaseInput): ReturnType<ModerateReviewUseCase['execute']> {
    return this.moderate.execute(input);
  }
}
