import type { Review } from '@modules/review/domain/review/review.entity';
import type { DataSource } from 'typeorm';

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

export interface InsertReviewRowOptions {
  rating: number;
  status?: string;
  museumId?: number | null;
  userId?: number;
  userName?: string;
  comment?: string;
  createdAt?: Date | string;
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
    createdAt,
  } = options;

  if (createdAt !== undefined) {
    const rows = await dataSource.query<{ id: string }[]>(
      `INSERT INTO "reviews" ("userId", "userName", "rating", "comment", "status", "museum_id", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
      [userId, userName, rating, comment, status, museumId, createdAt],
    );
    return rows[0].id;
  }

  const rows = await dataSource.query<{ id: string }[]>(
    `INSERT INTO "reviews" ("userId", "userName", "rating", "comment", "status", "museum_id")
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
    [userId, userName, rating, comment, status, museumId],
  );
  return rows[0].id;
}
