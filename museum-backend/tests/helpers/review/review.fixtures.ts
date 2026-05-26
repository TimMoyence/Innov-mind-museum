import type { Review } from '@modules/review/domain/review/review.entity';
import type { DataSource } from 'typeorm';

/**
 * Creates a Review entity with sensible defaults. Override any field via `overrides`.
 * @param overrides
 */
export const makeReview = (overrides: Partial<Review> = {}): Review =>
  ({
    id: 'review-001',
    userId: 1,
    userName: 'Test User',
    rating: 4,
    comment: 'Great app!',
    status: 'pending',
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-01'),
    ...overrides,
  }) as Review;

/**
 * Real-PG insert helper for integration tests (S-BE-AGG / T-AGG-2).
 *
 * Inserts an approved-by-default review row directly, bypassing the use-case
 * validation layer (we are exercising the SQL aggregation, not the create
 * flow). `museumId` defaults to `null` (global / B2C). The `comment` satisfies
 * the 10..2000 length constraint so the row survives if a CHECK is ever added.
 *
 * Column names are snake_case where the entity declares `name:` overrides
 * (`museum_id`), camelCase otherwise (`userId`, `userName`) — mirrors the
 * entity (`review.entity.ts`). Returns the generated review id.
 */
export interface InsertReviewRowOptions {
  rating: number;
  status?: string;
  museumId?: number | null;
  userId?: number;
  userName?: string;
  comment?: string;
}

export async function insertReviewRow(
  dataSource: DataSource,
  options: InsertReviewRowOptions,
): Promise<string> {
  const {
    rating,
    status = 'approved',
    museumId = null,
    userId = 1,
    userName = 'Test User',
    comment = 'A sufficiently long integration-test review comment.',
  } = options;

  const rows = await dataSource.query<{ id: string }[]>(
    `INSERT INTO "reviews" ("userId", "userName", "rating", "comment", "status", "museum_id")
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
    [userId, userName, rating, comment, status, museumId],
  );
  return rows[0].id;
}
