import type {
  CreateReviewInput,
  ReviewDTO,
  ListReviewsFilters,
  ModerateReviewInput,
} from './review.types';
import type { PaginatedResult } from '@shared/types/pagination';

/** Port for review data access. */
export interface IReviewRepository {
  /** Create a new review. */
  createReview(input: CreateReviewInput): Promise<ReviewDTO>;

  /** List reviews with optional status filter and pagination. */
  listReviews(filters: ListReviewsFilters): Promise<PaginatedResult<ReviewDTO>>;

  /** Get a single review by ID. Returns null if not found. */
  getReviewById(reviewId: string): Promise<ReviewDTO | null>;

  /** Update the status of a review (approve/reject). Returns null if not found. */
  moderateReview(input: ModerateReviewInput): Promise<ReviewDTO | null>;

  /** Get average rating and total count of approved reviews. */
  getAverageRating(): Promise<{ average: number; count: number }>;
}
