import { invalidInput } from '@shared/errors/app.error';

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
  maxLimit?: number;
}

export function assertPagination(
  params: PaginationParams,
  opts?: AssertPaginationOptions,
): PaginationParams {
  const { page, limit } = params;
  const maxLimit = opts?.maxLimit ?? 100;

  if (!Number.isInteger(page) || page < 1) {
    throw invalidInput('page must be a positive integer');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw invalidInput(`limit must be between 1 and ${String(maxLimit)}`);
  }

  return { page, limit };
}
