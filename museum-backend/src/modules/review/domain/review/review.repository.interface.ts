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

  /**
   * Wave B C7 / R-C7c — list reviews scoped to a given B2B tenant museum,
   * approved only by default. Pagination follows the same shape as
   * `listReviews`. Returns empty page (data:[], total:0) when no rows.
   */
  findByMuseum(museumId: number, filters: ListReviewsFilters): Promise<PaginatedResult<ReviewDTO>>;

  /**
   * NPS aggregate over `approved` reviews. Uses the 0-10 rating range (D8
   * cohabitation : a 1-5 review is still scored — counts as detractor if ≤ 6,
   * passive if 7-8, promoter if 9-10).
   *
   * Scope (C2 / R6-R7) :
   *   - `museumId` omitted / `null` / `undefined` → **global** aggregate over
   *     ALL approved reviews, INCLUDING rows with `museum_id IS NULL` (the
   *     dominant B2C V1 case). The museum predicate is simply omitted — NOT
   *     `museum_id IS NULL`.
   *   - `museumId` provided → per-museum aggregate (`museum_id IS NULL` rows
   *     are excluded for any specific museum).
   */
  aggregateNps(museumId?: number | null): Promise<NpsAggregate>;
}
