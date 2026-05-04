import { Review } from '@modules/review/domain/review/review.entity';

import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type {
  CreateReviewInput,
  ReviewDTO,
  ListReviewsFilters,
  ModerateReviewInput,
} from '@modules/review/domain/review/review.types';
import type { PaginatedResult } from '@shared/types/pagination';
import type { DataSource, Repository } from 'typeorm';

/** Map a Review entity to a ReviewDTO. */
function toDTO(entity: Review): ReviewDTO {
  return {
    id: entity.id,
    userId: entity.userId,
    userName: entity.userName,
    rating: entity.rating,
    comment: entity.comment,
    status: entity.status,
    createdAt: entity.createdAt.toISOString(),
  };
}

/** TypeORM implementation of the review repository. */
export class ReviewRepositoryPg implements IReviewRepository {
  private readonly repo: Repository<Review>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Review);
  }

  /** Inserts a new review and returns the created record. */
  async createReview(input: CreateReviewInput): Promise<ReviewDTO> {
    const entity = this.repo.create({
      userId: input.userId,
      userName: input.userName,
      rating: input.rating,
      comment: input.comment,
    });
    const saved = await this.repo.save(entity);
    return toDTO(saved);
  }

  /** Retrieves a paginated list of reviews with optional status filter. */
  async listReviews(filters: ListReviewsFilters): Promise<PaginatedResult<ReviewDTO>> {
    const { page, limit } = filters.pagination;
    const offset = (page - 1) * limit;

    const qb = this.repo.createQueryBuilder('r');

    if (filters.status) {
      qb.where('r.status = :status', { status: filters.status });
    }

    const total = await qb.getCount();

    const data = await qb.orderBy('r.createdAt', 'DESC').skip(offset).take(limit).getMany();

    return {
      data: data.map(toDTO),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Retrieves a review by ID. */
  async getReviewById(reviewId: string): Promise<ReviewDTO | null> {
    const entity = await this.repo.findOne({ where: { id: reviewId } });
    return entity ? toDTO(entity) : null;
  }

  /** Updates a review's status (approve/reject). */
  async moderateReview(input: ModerateReviewInput): Promise<ReviewDTO | null> {
    const result = await this.repo.update(input.reviewId, {
      status: input.status,
    });

    if ((result.affected ?? 0) === 0) return null;

    const entity = await this.repo.findOne({ where: { id: input.reviewId } });
    return entity ? toDTO(entity) : null;
  }

  /** Lists every review authored by a user, most-recent first (GDPR DSAR). */
  async listForUser(userId: number): Promise<ReviewDTO[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toDTO);
  }

  /** Computes the average rating and total count of approved reviews. */
  async getAverageRating(): Promise<{ average: number; count: number }> {
    const result = await this.repo
      .createQueryBuilder('review')
      .select('COALESCE(AVG(review.rating), 0)', 'average')
      .addSelect('COUNT(review.id)', 'count')
      .where('review.status = :status', { status: 'approved' })
      .getRawOne<{ average: string; count: string }>();

    return {
      average: Number.parseFloat(result?.average ?? '0'),
      count: Number.parseInt(result?.count ?? '0', 10),
    };
  }
}
