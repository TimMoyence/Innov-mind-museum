import type {
  CreateReviewInput,
  ReviewDTO,
  ListReviewsFilters,
  ModerateReviewInput,
} from './review.types';
import type { PaginatedResult } from '@shared/types/pagination';

export interface IReviewRepository {
  createReview(input: CreateReviewInput): Promise<ReviewDTO>;

  listReviews(filters: ListReviewsFilters): Promise<PaginatedResult<ReviewDTO>>;

  /** Returns null if not found. */
  getReviewById(reviewId: string): Promise<ReviewDTO | null>;

  /** Returns null if not found. */
  moderateReview(input: ModerateReviewInput): Promise<ReviewDTO | null>;

  /** Average and total of approved reviews. */
  getAverageRating(): Promise<{ average: number; count: number }>;

  /**
   * GDPR Art. 15 / Art. 20 data export. No pagination — a user's own review
   * history is bounded (typically < 10 rows). Ordered by createdAt DESC.
   */
  listForUser(userId: number): Promise<ReviewDTO[]>;
}
