import type {
  CreateReviewInput,
  ReviewDTO,
  ListReviewsFilters,
  ModerateReviewInput,
  NpsAggregate,
} from './review.types';
import type { PaginatedResult } from '@shared/types/pagination';

export interface IReviewRepository {
  createReview(input: CreateReviewInput): Promise<ReviewDTO>;

  listReviews(filters: ListReviewsFilters): Promise<PaginatedResult<ReviewDTO>>;

  getReviewById(reviewId: string): Promise<ReviewDTO | null>;

  moderateReview(input: ModerateReviewInput): Promise<ReviewDTO | null>;

  getAverageRating(): Promise<{ average: number; count: number }>;

  listForUser(userId: number): Promise<ReviewDTO[]>;

  findByMuseum(museumId: number, filters: ListReviewsFilters): Promise<PaginatedResult<ReviewDTO>>;

  aggregateNps(museumId?: number | null): Promise<NpsAggregate>;
}
