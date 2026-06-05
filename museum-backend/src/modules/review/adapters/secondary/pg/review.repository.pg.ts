import { resolveNpsScaleEpoch } from '@modules/review/domain/review/nps-scale-epoch';
import { Review } from '@modules/review/domain/review/review.entity';
import { paginate } from '@shared/pagination/offset-paginate';

import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type {
  CreateReviewInput,
  ReviewDTO,
  ListReviewsFilters,
  ModerateReviewInput,
  NpsAggregate,
} from '@modules/review/domain/review/review.types';
import type { PaginatedResult } from '@shared/types/pagination';
import type { DataSource, Repository } from 'typeorm';

function toDTO(entity: Review): ReviewDTO {
  return {
    id: entity.id,
    userId: entity.userId,
    userName: entity.userName,
    rating: entity.rating,
    comment: entity.comment,
    status: entity.status,
    museumId: entity.museumId ?? null,
    createdAt: entity.createdAt.toISOString(),
  };
}

export class ReviewRepositoryPg implements IReviewRepository {
  private readonly repo: Repository<Review>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Review);
  }

  async createReview(input: CreateReviewInput): Promise<ReviewDTO> {
    const draft: Partial<Review> = {
      userId: input.userId,
      userName: input.userName,
      rating: input.rating,
      comment: input.comment,
      museumId: input.museumId ?? null,
    };
    // NPS attribution link (C2 / R5). Only set when the caller threads a
    // sessionId — keeps the persisted shape byte-identical for create paths
    // that never carry a session (e.g. legacy / direct repo callers).
    if (input.sessionId !== undefined) {
      draft.sessionId = input.sessionId;
    }
    const entity = this.repo.create(draft);
    const saved = await this.repo.save(entity);
    return toDTO(saved);
  }

  async listReviews(filters: ListReviewsFilters): Promise<PaginatedResult<ReviewDTO>> {
    const qb = this.repo.createQueryBuilder('r');

    // `andWhere` first-call behaves as `where` in TypeORM 0.3.x, so we can
    // accumulate predicates uniformly without tracking the initial state.
    if (filters.status) {
      qb.andWhere('r.status = :status', { status: filters.status });
    }
    // Wave B C7 / R-C7c — tenant scope. Skip when undefined/null (super_admin
    // cross-tenant view).
    if (filters.museumId !== undefined && filters.museumId !== null) {
      qb.andWhere('r.museumId = :museumId', { museumId: filters.museumId });
    }

    qb.orderBy('r.createdAt', 'DESC');

    return await paginate(qb, filters.pagination, toDTO);
  }

  /**
   * Wave B C7 / R-C7c — `listReviews` with tenant scope pre-bound + `approved`
   * default. Convenience for the per-tenant public view (museum operator
   * dashboard or per-museum public reviews page).
   */
  async findByMuseum(
    museumId: number,
    filters: ListReviewsFilters,
  ): Promise<PaginatedResult<ReviewDTO>> {
    return await this.listReviews({
      status: filters.status ?? 'approved',
      museumId,
      pagination: filters.pagination,
    });
  }

  /**
   * NPS aggregate over `approved` reviews. NPS = %promoters - %detractors,
   * computed in SQL via conditional COUNT so a single round-trip + indexed scan
   * suffices. `count = 0` → all buckets 0 + nps 0 (no signal).
   *
   * Scope (C2 / R6-R7) :
   *   - `museumId` null/undefined → global; the museum predicate is OMITTED so
   *     `museum_id IS NULL` rows are INCLUDED (the dominant B2C V1 case). We do
   *     NOT add `museum_id IS NULL` — simply skip the predicate.
   *   - `museumId` provided → `AND r.museumId = :museumId` (NULL rows excluded).
   *
   * `status = 'approved'` is always present (pending / rejected excluded so
   * moderation controls the public score).
   *
   * NPS scale-epoch (F3) : the rating scale switched 1-5 (legacy stars) → 0-10
   * (NPS). A legacy "5" is indistinguishable by value from an NPS "5" yet would
   * now be miscounted as a detractor (≤6). So we count ONLY reviews created
   * AT/AFTER the configured epoch (`resolveNpsScaleEpoch()` — env
   * `NPS_SCALE_EPOCH` or the deploy-date default; `createdAt >= :npsEpoch`,
   * parameterized timestamptz) — the legacy cohort is excluded from BOTH the
   * global and the per-museum aggregate. Applies before bucketing, so buckets +
   * total + nps are all over the post-epoch cohort only.
   */
  async aggregateNps(museumId?: number | null): Promise<NpsAggregate> {
    const qb = this.repo
      .createQueryBuilder('r')
      .select('COUNT(*) FILTER (WHERE r.rating >= 9 AND r.rating <= 10)', 'promoters')
      .addSelect('COUNT(*) FILTER (WHERE r.rating >= 7 AND r.rating <= 8)', 'passives')
      .addSelect('COUNT(*) FILTER (WHERE r.rating >= 0 AND r.rating <= 6)', 'detractors')
      .addSelect('COUNT(*)', 'count')
      .where('r.status = :status', { status: 'approved' })
      // F3 — exclude legacy 1-5 reviews predating the 0-10 scale switch. Bound
      // as a parameter (never concatenated); pg casts the ISO string to the
      // `createdAt` timestamptz column. Applies to global AND per-museum paths.
      // Resolved per-call so an env override is honoured without a restart.
      .andWhere('r.createdAt >= :npsEpoch', { npsEpoch: resolveNpsScaleEpoch() });

    // Per-museum scope ONLY when a concrete museumId is supplied. Omitting the
    // predicate (not adding `IS NULL`) is the key global-incl-NULL fix (R7).
    if (museumId !== undefined && museumId !== null) {
      qb.andWhere('r.museumId = :museumId', { museumId });
    }

    const row = await qb.getRawOne<{
      promoters: string;
      passives: string;
      detractors: string;
      count: string;
    }>();

    const promoters = Number.parseInt(row?.promoters ?? '0', 10);
    const passives = Number.parseInt(row?.passives ?? '0', 10);
    const detractors = Number.parseInt(row?.detractors ?? '0', 10);
    const count = Number.parseInt(row?.count ?? '0', 10);

    const nps = count === 0 ? 0 : Math.round(((promoters - detractors) / count) * 100);

    return { nps, promoters, passives, detractors, count };
  }

  async getReviewById(reviewId: string): Promise<ReviewDTO | null> {
    const entity = await this.repo.findOne({ where: { id: reviewId } });
    return entity ? toDTO(entity) : null;
  }

  async moderateReview(input: ModerateReviewInput): Promise<ReviewDTO | null> {
    const result = await this.repo.update(input.reviewId, {
      status: input.status,
    });

    if ((result.affected ?? 0) === 0) return null;

    const entity = await this.repo.findOne({ where: { id: input.reviewId } });
    return entity ? toDTO(entity) : null;
  }

  /** GDPR DSAR — every review authored by a user, most-recent first. */
  async listForUser(userId: number): Promise<ReviewDTO[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toDTO);
  }

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
