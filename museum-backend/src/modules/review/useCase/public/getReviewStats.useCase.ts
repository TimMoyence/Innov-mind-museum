import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';

export interface ReviewStats {
  average: number;
  count: number;
}

/** Average rating + count of approved reviews. */
export class GetReviewStatsUseCase {
  constructor(private readonly repository: IReviewRepository) {}

  async execute(): Promise<ReviewStats> {
    return await this.repository.getAverageRating();
  }
}
