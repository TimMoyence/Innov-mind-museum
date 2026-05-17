import { REVIEW_STATUSES } from '@modules/review/domain/review/review.types';
import { badRequest } from '@shared/errors/app.error';

import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type {
  ReviewDTO,
  ListReviewsFilters,
  ReviewStatus,
} from '@modules/review/domain/review/review.types';
import type { PaginatedResult } from '@shared/types/pagination';

export interface ListAllReviewsInput {
  status?: string;
  page: number;
  limit: number;
}

/** Admin use only — lists all reviews regardless of status. */
export class ListAllReviewsUseCase {
  constructor(private readonly repository: IReviewRepository) {}

  async execute(input: ListAllReviewsInput): Promise<PaginatedResult<ReviewDTO>> {
    if (!Number.isInteger(input.page) || input.page < 1) {
      throw badRequest('page must be a positive integer');
    }
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw badRequest('limit must be between 1 and 100');
    }

    if (input.status && !REVIEW_STATUSES.includes(input.status as ReviewStatus)) {
      throw badRequest(`status must be one of: ${REVIEW_STATUSES.join(', ')}`);
    }

    const filters: ListReviewsFilters = {
      status: input.status as ReviewStatus | undefined,
      pagination: { page: input.page, limit: input.limit },
    };

    return await this.repository.listReviews(filters);
  }
}
