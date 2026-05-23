import type { PaginatedResult, PaginationParams } from '@shared/types/pagination';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * Offset-pagination helper for TypeORM `SelectQueryBuilder`.
 *
 * Spec §4 R1 + design §2.1: single-call `getManyAndCount` round-trip,
 * canonical `PaginatedResult<T>` shape with field order
 * `data, total, page, limit, totalPages`. `totalPages = 0` when `total = 0`.
 *
 * The caller is responsible for `orderBy` (R1.4): the helper applies only
 * `skip`/`take`. `mapper` is optional; when omitted, entities are cast
 * (identity branch, R5.1) — no per-element allocation.
 *
 * `params` is typed as `PaginationParams` (shared with `assertPagination`
 * from PR-5) so callers can flow validated pagination through without
 * structural duplication.
 *
 * @example
 *   return paginate(qb, { page, limit }, mapUser);
 *   return paginate<Review>(qb, { page, limit }); // identity, no mapper
 */
export async function paginate<TEntity extends ObjectLiteral, TDTO = TEntity>(
  qb: SelectQueryBuilder<TEntity>,
  params: PaginationParams,
  mapper?: (entity: TEntity) => TDTO,
): Promise<PaginatedResult<TDTO>> {
  const { page, limit } = params;
  const offset = (page - 1) * limit;
  const [entities, total] = await qb.skip(offset).take(limit).getManyAndCount();
  const data = mapper ? entities.map((e) => mapper(e)) : (entities as unknown as TDTO[]);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return { data, total, page, limit, totalPages };
}
