import { badRequest } from '@shared/errors/app.error';

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AssertPaginationOptions {
  /** Inclusive upper bound for `limit`. Defaults to 100. */
  maxLimit?: number;
}

/**
 * Validates pagination params (page, limit) and returns them unchanged.
 *
 * Wire-format contract (byte-identical across all 7 PR-5 callers, 2026-05-23):
 * - Page invalid → `'page must be a positive integer'` (400, BAD_REQUEST).
 * - Limit invalid (default) → `'limit must be between 1 and 100'` (400, BAD_REQUEST).
 * - Limit invalid (override) → `'limit must be between 1 and <maxLimit>'`.
 *
 * `maxLimit` defaults to 100. Pass `opts.maxLimit` to override.
 *
 * Pure function: no I/O, no mutation, no logging. Safe in hot paths.
 *
 * @example
 *   const { page, limit } = assertPagination({ page: input.page, limit: input.limit });
 *   const { page, limit } = assertPagination(filters.pagination);
 *   const { page, limit } = assertPagination({ page, limit }, { maxLimit: 200 });
 */
export function assertPagination(
  params: PaginationParams,
  opts?: AssertPaginationOptions,
): PaginationParams {
  const { page, limit } = params;
  const maxLimit = opts?.maxLimit ?? 100;

  if (!Number.isInteger(page) || page < 1) {
    throw badRequest('page must be a positive integer');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw badRequest(`limit must be between 1 and ${String(maxLimit)}`);
  }

  return { page, limit };
}
