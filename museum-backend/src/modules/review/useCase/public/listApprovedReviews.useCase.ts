import { badRequest } from '@shared/errors/app.error';

import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type { ReviewDTO, ListReviewsFilters } from '@modules/review/domain/review/review.types';
import type { PaginatedResult } from '@shared/types/pagination';

/** Input for listing approved reviews (public). */
interface ListApprovedReviewsInput {
  page: number;
  limit: number;
}

/** Lists only approved reviews, paginated, ordered by createdAt DESC. */
export class ListApprovedReviewsUseCase {
  constructor(private readonly repository: IReviewRepository) {}

  /** Validates pagination and retrieves approved reviews. */
  async execute(input: ListApprovedReviewsInput): Promise<PaginatedResult<ReviewDTO>> {
    if (!Number.isInteger(input.page) || input.page < 1) {
      throw badRequest('page must be a positive integer');
    }
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw badRequest('limit must be between 1 and 100');
    }

    const filters: ListReviewsFilters = {
      status: 'approved',
      pagination: { page: input.page, limit: input.limit },
    };

    return await this.repository.listReviews(filters);
  }
}
