import type {
  ListAllReviewsInput,
  ListAllReviewsUseCase,
} from '@modules/review/useCase/admin/listAllReviews.useCase';
import type {
  ModerateReviewUseCase,
  ModerateReviewUseCaseInput,
} from '@modules/review/useCase/moderation/moderateReview.useCase';

/** Admin-side facade over the review module — keeps cross-module coupling in one place. */
export class AdminReviewFacade {
  constructor(
    private readonly listAll: ListAllReviewsUseCase,
    private readonly moderate: ModerateReviewUseCase,
  ) {}

  list(input: ListAllReviewsInput): ReturnType<ListAllReviewsUseCase['execute']> {
    return this.listAll.execute(input);
  }

  moderateReview(input: ModerateReviewUseCaseInput): ReturnType<ModerateReviewUseCase['execute']> {
    return this.moderate.execute(input);
  }
}
