import { REVIEW_STATUSES } from '@modules/review/domain/review/review.types';
import { assertPagination } from '@shared/types/pagination';
import { assertOneOf } from '@shared/validation/one-of';

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
  museumId?: number | null;
}

export class ListAllReviewsUseCase {
  constructor(private readonly repository: IReviewRepository) {}

  async execute(input: ListAllReviewsInput): Promise<PaginatedResult<ReviewDTO>> {
    const { page, limit } = assertPagination({ page: input.page, limit: input.limit });

    if (input.status) assertOneOf('status', REVIEW_STATUSES, input.status);

    const filters: ListReviewsFilters = {
      status: input.status as ReviewStatus | undefined,
      museumId: input.museumId,
      pagination: { page, limit },
    };

    return await this.repository.listReviews(filters);
  }
}
