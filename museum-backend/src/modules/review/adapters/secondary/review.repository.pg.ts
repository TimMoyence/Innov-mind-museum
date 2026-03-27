 
import pool from '@data/db';

import type { IReviewRepository } from '../../domain/review.repository.interface';
import type {
  CreateReviewInput,
  ReviewDTO,
  ListReviewsFilters,
  ModerateReviewInput,
} from '../../domain/review.types';
import type { PaginatedResult } from '@shared/types/pagination';

/** Map a raw reviews row to a ReviewDTO. */
function mapReviewRow(row: Record<string, unknown>): ReviewDTO {
  return {
    id: row.id as string,
    userId: row.userId as number,
    userName: row.userName as string,
    rating: row.rating as number,
    comment: row.comment as string,
    status: row.status as string,
    createdAt: (row.createdAt as Date).toISOString(),
  };
}

/** PostgreSQL implementation of the review repository. */
export class ReviewRepositoryPg implements IReviewRepository {
  /** Inserts a new review and returns the created record. */
  async createReview(input: CreateReviewInput): Promise<ReviewDTO> {
    const result = await pool.query(
      `INSERT INTO "reviews" ("userId", "userName", "rating", "comment")
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.userId, input.userName, input.rating, input.comment],
    );
    return mapReviewRow(result.rows[0]);
  }

  /** Retrieves a paginated list of reviews with optional status filter. */
  async listReviews(filters: ListReviewsFilters): Promise<PaginatedResult<ReviewDTO>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.status) {
      conditions.push(`r."status" = $${idx}`);
      values.push(filters.status);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { page, limit } = filters.pagination;
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM "reviews" r ${where}`,
      values,
    );
    const total = Number.parseInt(countResult.rows[0].total as string, 10);

    const dataResult = await pool.query(
      `SELECT r.*
       FROM "reviews" r
       ${where}
       ORDER BY r."createdAt" DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    );

    return {
      data: dataResult.rows.map(mapReviewRow),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Retrieves a review by ID. */
  async getReviewById(reviewId: string): Promise<ReviewDTO | null> {
    const result = await pool.query(`SELECT * FROM "reviews" WHERE "id" = $1`, [reviewId]);

    if (result.rows.length === 0) return null;
    return mapReviewRow(result.rows[0]);
  }

  /** Updates a review's status (approve/reject). */
  async moderateReview(input: ModerateReviewInput): Promise<ReviewDTO | null> {
    const result = await pool.query(
      `UPDATE "reviews"
       SET "status" = $1, "updatedAt" = NOW()
       WHERE "id" = $2
       RETURNING *`,
      [input.status, input.reviewId],
    );

    if (result.rows.length === 0) return null;
    return mapReviewRow(result.rows[0]);
  }

  /** Computes the average rating and total count of approved reviews. */
  async getAverageRating(): Promise<{ average: number; count: number }> {
    const result = await pool.query(
      `SELECT COALESCE(AVG("rating"), 0) AS average, COUNT(*) AS count
       FROM "reviews"
       WHERE "status" = 'approved'`,
    );

    return {
      average: Number.parseFloat(result.rows[0].average as string),
      count: Number.parseInt(result.rows[0].count as string, 10),
    };
  }
}
