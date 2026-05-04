import type { IReviewRepository } from '../../domain/review/review.repository.interface';

/** Stats returned by the get-review-stats use case. */
export interface ReviewStats {
  average: number;
  count: number;
}

/** Retrieves aggregate review statistics (average rating + count). */
export class GetReviewStatsUseCase {
  constructor(private readonly repository: IReviewRepository) {}

  /** Returns the average rating and total count of approved reviews. */
  async execute(): Promise<ReviewStats> {
    return await this.repository.getAverageRating();
  }
}
