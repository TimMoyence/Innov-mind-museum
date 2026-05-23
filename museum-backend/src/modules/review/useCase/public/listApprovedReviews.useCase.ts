import { assertPagination } from '@shared/types/pagination';

import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type { ReviewDTO, ListReviewsFilters } from '@modules/review/domain/review/review.types';
import type { PaginatedResult } from '@shared/types/pagination';

interface ListApprovedReviewsInput {
  page: number;
  limit: number;
}

/** Approved reviews only, paginated, ordered by createdAt DESC. */
export class ListApprovedReviewsUseCase {
  constructor(private readonly repository: IReviewRepository) {}

  async execute(input: ListApprovedReviewsInput): Promise<PaginatedResult<ReviewDTO>> {
    const { page, limit } = assertPagination({ page: input.page, limit: input.limit });

    const filters: ListReviewsFilters = {
      status: 'approved',
      pagination: { page, limit },
    };

    return await this.repository.listReviews(filters);
  }
}
