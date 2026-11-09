import type { PaginatedResult, PaginationParams } from '@shared/types/pagination';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

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
