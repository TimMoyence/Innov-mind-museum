import { REVIEW_STATUSES } from '@modules/review/domain/review/review.types';
import { invalidInput } from '@shared/errors/app.error';
import { assertPagination } from '@shared/types/pagination';

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

    if (input.status && !REVIEW_STATUSES.includes(input.status as ReviewStatus)) {
      throw invalidInput(`status must be one of: ${REVIEW_STATUSES.join(', ')}`);
    }

    const filters: ListReviewsFilters = {
      status: input.status as ReviewStatus | undefined,
      museumId: input.museumId,
      pagination: { page, limit },
    };

    return await this.repository.listReviews(filters);
  }
}
